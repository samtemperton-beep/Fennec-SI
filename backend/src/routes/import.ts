import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

interface Holding {
  ticker: string;
  shares: number;
  buyPrice: number;
  market: string;
}

function parseHatch(rows: string[][]): Holding[] {
  return rows.slice(1).map(r => ({
    ticker: (r[0] || '').trim().toUpperCase(),
    shares: parseFloat(r[2] || '0'),
    buyPrice: parseFloat(r[3] || '0'),
    market: 'US',
  })).filter(h => h.ticker && h.shares > 0);
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
  if (header.includes('hatch')) return 'hatch';
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

  const rows = csv.split('\n').map((line: string) =>
    line.split(',').map((cell: string) => cell.trim().replace(/^"|"$/g, ''))
  ).filter((r: string[]) => r.some(c => c));

  const format = detectFormat(rows);
  let holdings: Holding[];
  if (format === 'hatch') holdings = parseHatch(rows);
  else if (format === 'sharesies') holdings = parseSharesies(rows);
  else if (format === 'ibkr') holdings = parseIBKR(rows);
  else holdings = parseGeneric(rows);

  res.json({ holdings, format, count: holdings.length });
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
