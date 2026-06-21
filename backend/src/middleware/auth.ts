import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier, is_admin, usage_count, last_usage_reset')
    .eq('id', user.id)
    .single();

  (req as any).user = user;
  (req as any).isPremium = profile?.subscription_tier === 'premium';
  (req as any).isAdmin = profile?.is_admin === true;
  (req as any).usageCount = profile?.usage_count ?? 0;
  (req as any).lastUsageReset = profile?.last_usage_reset;
  next();
}

export const FREE_DAILY_AI_LIMIT = 10;
export const FREE_MAX_HOLDINGS = 10;

// Checks daily AI quota for free users and increments the counter.
// Returns false (and sends a 429) if the free limit is hit.
export async function checkAndIncrementUsage(req: Request, res: Response): Promise<boolean> {
  if ((req as any).isPremium) return true;

  const user = (req as any).user;
  const today = new Date().toISOString().slice(0, 10);
  let count: number = (req as any).usageCount ?? 0;
  const lastReset: string = (req as any).lastUsageReset ?? '';

  // Reset counter if it's a new day
  if (lastReset !== today) {
    count = 0;
    await supabase.from('profiles').update({ usage_count: 0, last_usage_reset: today }).eq('id', user.id);
  }

  if (count >= FREE_DAILY_AI_LIMIT) {
    res.status(429).json({
      error: `Free plan limit reached — ${FREE_DAILY_AI_LIMIT} AI calls per day. Upgrade to Premium for unlimited access.`,
      limitReached: true,
    });
    return false;
  }

  await supabase.from('profiles').update({ usage_count: count + 1 }).eq('id', user.id);
  return true;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}
