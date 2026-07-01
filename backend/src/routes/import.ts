import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

interface Holding {
  ticker: string;
  shares: number;
  buyPrice: number;
  market: string;
}

function parseHatch(rows: string[][]): Holding[] {
  // Hatch columns: Ticker,Name,Portion,Shares,Average cost (USD),Average cost (NZD),...
  // Allow buyPrice = 0 for private securities (e.g. SpaceX) that have no listed market price
  return rows.slice(1)
    .filter(r => r.length > 3 && r[0] && !r[0].replace(/^"/, '').startsWith('An FX'))
    .map(r => ({
      ticker: (r[0] || '').trim().toUpperCase(),
      shares: parseFloat(r[3] || '0'),
      buyPrice: parseFloat(r[4] || '0') || 0,
      market: 'US',
    }))
    .filter(h => h.ticker && /^[A-Z0-9]{1,10}$/.test(h.ticker) && h.shares > 0);
}

function parseSharesies(rows: string[][]): Holding[] {
  return rows.slice(1).map(r => ({
    ticker: (r[1] || '').trim().toUpperCase(),
    shares: parseFloat(r[3] || '0'),
    buyPrice: parseFloat(r[4] || '0'),
    market: r[2]?.includes('NZ') ? 'NZX' : r[2]?.includes('AU') ? 'ASX' : 'US',
  })).filter(h => h.ticker && h.shares > 0);
}

function parseIBKR(rows: string[][]): Holding[] {
  return rows.filter(r => r[0] === 'Data').map(r => ({
    ticker: (r[2] || '').trim().toUpperCase(),
    shares: parseFloat(r[5] || '0'),
    buyPrice: parseFloat(r[7] || '0'),
    market: 'US',
  })).filter(h => h.ticker && h.shares > 0);
}

function detectFormat(rows: string[][]): string {
  const header = (rows[0] || []).join(',').toLowerCase();
  if (header.includes('average cost (usd)') || header.includes('average cost (nzd)')) return 'hatch';
  if (header.includes('sharesies') || header.includes('portfolio name')) return 'sharesies';
  if (rows.some(r => r[0] === 'Data' && r[1] === 'Trades')) return 'ibkr';
  return 'generic';
}

function parseGeneric(rows: string[][]): Holding[] {
  return rows.slice(1).map(r => ({
    ticker: (r[0] || '').trim().toUpperCase(),
    shares: parseFloat(r[1] || r[2] || '0'),
    buyPrice: parseFloat(r[2] || r[3] || '0'),
    market: 'US',
  })).filter(h => h.ticker && h.shares > 0);
}

router.post('/csv', requireAuth, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV data' });

  const rows = csv.split('\n').map((line: string) => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  }).filter((r: string[]) => r.some(c => c));

  const format = detectFormat(rows);
  let holdings: Holding[];
  if (format === 'hatch') holdings = parseHatch(rows);
  else if (format === 'sharesies') holdings = parseSharesies(rows);
  else if (format === 'ibkr') holdings = parseIBKR(rows);
  else holdings = parseGeneric(rows);

  res.json({ holdings, format, count: holdings.length });
});

function parseCSV(csv: string) {
  const rows = csv.split('\n').map((line: string) => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  }).filter((r: string[]) => r.some((c: string) => c));
  const format = detectFormat(rows);
  let parsed: Holding[];
  if (format === 'hatch') parsed = parseHatch(rows);
  else if (format === 'sharesies') parsed = parseSharesies(rows);
  else if (format === 'ibkr') parsed = parseIBKR(rows);
  else parsed = parseGeneric(rows);
  return { format, parsed };
}

// POST /api/import/sync — preview or full sync from CSV
// ?preview=true returns what would change without writing; omit to apply
router.post('/sync', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { csv, preview } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV data' });

  const { format, parsed } = parseCSV(csv);
  if (parsed.length === 0) return res.status(400).json({ error: 'Could not extract any holdings from the CSV. Make sure you are uploading a holdings or portfolio export.' });

  const { data: existing } = await supabase.from('holdings').select('id, ticker, shares, buy_price').eq('user_id', user.id);
  const existingMap = new Map((existing || []).map((h: any) => [h.ticker.toUpperCase(), h]));
  const csvSet = new Set(parsed.map(h => h.ticker));

  const toAdd = parsed.filter(h => !existingMap.has(h.ticker)).map(h => h.ticker);
  const toUpdate = parsed.filter(h => existingMap.has(h.ticker)).map(h => h.ticker);
  const toRemove = (existing || []).filter((h: any) => !csvSet.has(h.ticker.toUpperCase())).map((h: any) => h.ticker);

  // Preview mode: return what would change without writing
  if (preview) {
    return res.json({ format, preview: true, toAdd, toUpdate, toRemove, total: parsed.length });
  }

  // Apply sync: delete ALL existing holdings then re-insert from CSV
  // This avoids duplicate rows from partial previous syncs and handles removals cleanly
  await supabase.from('holdings').delete().eq('user_id', user.id);

  const failed: string[] = [];
  for (const h of parsed) {
    const existing_row = existingMap.get(h.ticker);
    const { error } = await supabase.from('holdings').insert({
      user_id: user.id,
      ticker: h.ticker,
      shares: h.shares,
      buy_price: h.buyPrice || 0,
      // Preserve existing current_price if we have it, otherwise use buyPrice
      current_price: existing_row?.current_price || h.buyPrice || 0,
      market: h.market,
      is_verified: true,
    });
    if (error) failed.push(h.ticker);
  }

  res.json({ format, added: toAdd, updated: toUpdate, removed: toRemove, failed });
});

router.post('/screenshot', requireAuth, async (req, res) => {
  const { imageBase64, mediaType = 'image/jpeg' } = req.body;
  const user = (req as any).user;
  if (!imageBase64) return res.status(400).json({ error: 'No image' });

  const client = new Anthropic({ apiKey: user.user_metadata?.anthropic_key || process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: 'Extract all stock holdings from this portfolio screenshot. Return a JSON array of objects with: ticker (stock symbol), shares (number of shares), buyPrice (average buy price). Only include actual holdings, not cash.',
          },
        ],
      }],
    });
    const text = (msg.content[0] as any).text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const holdings = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    res.json({ holdings, count: holdings.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
