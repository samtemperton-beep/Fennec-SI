import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

interface Holding {
  ticker: string;
  shares: number;
  buy_price: number;
  current_price: number;
  sector?: string;
  is_verified?: boolean;
}

function computeGainPct(holdings: Holding[]): number {
  const cost = holdings.reduce((s, h) => s + h.buy_price * h.shares, 0);
  const value = holdings.reduce((s, h) => s + h.current_price * h.shares, 0);
  return cost > 0 ? ((value - cost) / cost) * 100 : 0;
}

function uniqueSectors(holdings: Holding[]): number {
  return new Set(holdings.map(h => h.sector).filter(Boolean)).size;
}

export async function evaluateAndAwardBadges(userId: string, holdings: Holding[], hasVerification: boolean) {
  const gainPct = computeGainPct(holdings);
  const sectors = uniqueSectors(holdings);
  const count = holdings.length;

  const candidates: { id: string; metadata: Record<string, any> }[] = [];

  if (gainPct > 0) candidates.push({ id: 'first_gain', metadata: { gain_pct: gainPct } });
  if (gainPct >= 10) candidates.push({ id: 'gain_10', metadata: { gain_pct: gainPct } });
  if (gainPct >= 25) candidates.push({ id: 'gain_25', metadata: { gain_pct: gainPct } });
  if (gainPct >= 50) candidates.push({ id: 'gain_50', metadata: { gain_pct: gainPct } });
  if (gainPct >= 100) candidates.push({ id: 'gain_100', metadata: { gain_pct: gainPct } });
  if (sectors >= 5) candidates.push({ id: 'diversified', metadata: { sectors } });
  if (count >= 5) candidates.push({ id: 'five_holdings', metadata: { count } });
  if (count >= 10) candidates.push({ id: 'ten_holdings', metadata: { count } });
  if (hasVerification) candidates.push({ id: 'verified_investor', metadata: {} });

  // Get already-earned badges to avoid duplicates
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);
  const earned = new Set((existing || []).map((r: any) => r.badge_id));

  const newBadges = candidates.filter(c => !earned.has(c.id));
  if (newBadges.length === 0) return [];

  await supabase.from('user_badges').insert(
    newBadges.map(b => ({ user_id: userId, badge_id: b.id, metadata: b.metadata }))
  );

  return newBadges.map(b => b.id);
}
