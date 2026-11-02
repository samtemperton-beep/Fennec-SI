import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
import { canUse, limitFor, lockedMessage, PlanFeature } from '../services/plans';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

/** The assurance level claim from a Supabase access token ('aal1' or 'aal2'). */
function tokenAal(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal ?? null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  // Two-factor: once a user has a verified authenticator, only sessions that
  // completed the code step (aal2) may use the API. The token has already been
  // validated by getUser above, so reading its claims here is safe.
  if (user.factors?.some(f => f.status === 'verified') && tokenAal(token) !== 'aal2') {
    return res.status(401).json({ error: 'Two-factor verification required', code: 'mfa_required' });
  }

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


// In-memory cache for platform settings (refreshes every 60s)
let settingsCache: Record<string, string> = {};
let settingsCacheAt = 0;

export async function getPlatformSettings(): Promise<Record<string, string>> {
  if (Date.now() - settingsCacheAt < 60_000) return settingsCache;
  const { data } = await supabase.from('platform_settings').select('key, value');
  if (data && data.length > 0) {
    settingsCache = Object.fromEntries(data.map((r: any) => [r.key, r.value]));
    settingsCacheAt = Date.now();
  }
  return settingsCache;
}

export function invalidateSettingsCache() {
  settingsCacheAt = 0;
}

// Blocks a feature the account's plan doesn't include (set on the admin page).
export function requireFeature(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (canUse(await getPlatformSettings(), feature, (req as any).isPremium)) return next();
    res.status(403).json({ error: lockedMessage(feature), premiumRequired: true });
  };
}

// Counts an AI call against the plan's daily limit (0 = no limit; calls are
// still counted so the admin page shows usage). Returns false, having sent a
// 429, once the limit is reached.
export async function checkAndIncrementUsage(req: Request, res: Response): Promise<boolean> {
  const user = (req as any).user;
  const isPremium = (req as any).isPremium;
  const today = new Date().toISOString().slice(0, 10);
  let count: number = (req as any).usageCount ?? 0;
  const lastReset: string = (req as any).lastUsageReset ?? '';

  const settings = await getPlatformSettings();
  const dailyLimit = limitFor(settings, 'daily_ai_calls', isPremium);

  // Reset counter if it's a new day
  if (lastReset !== today) {
    count = 0;
    await supabase.from('profiles').update({ usage_count: 0, last_usage_reset: today }).eq('id', user.id);
  }

  if (dailyLimit > 0 && count >= dailyLimit) {
    res.status(429).json({
      error: isPremium
        ? `You've reached today's limit of ${dailyLimit} AI calls. It resets tomorrow.`
        : `Free plan limit reached: ${dailyLimit} AI calls per day. Premium raises it.`,
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
