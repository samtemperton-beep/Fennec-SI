// What free and premium accounts can use. Each feature can be switched on or off
// per plan, and each limit set per plan, from the admin page. Nothing saved
// means the default below; "Reset to defaults" clears what's saved.
//
// Settings keys: plan_<tier>_<feature> = 'on' | 'off', and
// limit_<tier>_<limit> = a whole number, where 0 means no limit.

export type Tier = 'free' | 'premium';

export type PlanFeature =
  | 'helper' | 'analyze' | 'summary' | 'news' | 'top10' | 'opportunities'
  | 'ipo' | 'deep_dive' | 'draft_post' | 'inbox' | 'business' | 'verified' | 'partner';

export type PlanLimit = 'daily_ai_calls' | 'holdings' | 'discover_results';

// Free gets enough to run their money in Fennec and see what the AI can do.
// Premium adds the extras: research, Gmail bills, the business tools and a
// verified place on the leaderboard, with no daily caps.
export const PLAN_FEATURES: Record<PlanFeature, { label: string; desc: string; defaults: Record<Tier, boolean> }> = {
  helper:        { label: 'Fennec chat',          desc: 'The fox chat on every page',                 defaults: { free: true,  premium: true } },
  analyze:       { label: 'Stock Analyzer',       desc: 'Buy, hold or sell signal for a holding',     defaults: { free: true,  premium: true } },
  summary:       { label: 'Daily briefing',       desc: "Fennec's summary on the dashboard",          defaults: { free: true,  premium: true } },
  news:          { label: 'News Digest',          desc: 'AI summary of the news for your holdings',   defaults: { free: true,  premium: true } },
  top10:         { label: "Today's Picks",        desc: 'Top 10 stock picks',                         defaults: { free: true,  premium: true } },
  opportunities: { label: 'Discover',             desc: 'Hidden gem picks (see the results limit)',   defaults: { free: true,  premium: true } },
  ipo:           { label: 'IPO Analysis',         desc: 'Scores upcoming IPOs',                       defaults: { free: true,  premium: true } },
  deep_dive:     { label: 'Deep Dive',            desc: 'In-depth research on one stock',             defaults: { free: false, premium: true } },
  draft_post:    { label: 'Community Post Draft', desc: 'AI drafts a post about a signal',            defaults: { free: false, premium: true } },
  inbox:         { label: 'Gmail bill scanning',  desc: 'Finds bills and invoices in Gmail',          defaults: { free: false, premium: true } },
  business:      { label: 'Business section',     desc: 'Invoices, business transactions and tax',    defaults: { free: false, premium: true } },
  verified:      { label: 'Verified portfolio',   desc: 'Verified badge and leaderboard ranking',     defaults: { free: false, premium: true } },
  partner:       { label: 'Partner sharing',      desc: 'Link with a partner to share accounts, bills and goals', defaults: { free: true, premium: true } },
};

export const PLAN_LIMITS: Record<PlanLimit, { label: string; desc: string; defaults: Record<Tier, number> }> = {
  daily_ai_calls:   { label: 'AI calls per day',  desc: 'Each AI answer or analysis counts as one', defaults: { free: 10, premium: 0 } },
  holdings:         { label: 'Holdings tracked',  desc: 'Stocks in the portfolio',                  defaults: { free: 10, premium: 0 } },
  discover_results: { label: 'Discover results',  desc: 'Picks shown out of 6',                     defaults: { free: 2,  premium: 0 } },
};

const tierOf = (isPremium: boolean): Tier => (isPremium ? 'premium' : 'free');

export function canUse(settings: Record<string, string>, feature: PlanFeature, isPremium: boolean): boolean {
  const tier = tierOf(isPremium);
  const saved = settings[`plan_${tier}_${feature}`];
  return saved === 'on' ? true : saved === 'off' ? false : PLAN_FEATURES[feature].defaults[tier];
}

/** The limit for this plan, or 0 for no limit. */
export function limitFor(settings: Record<string, string>, limit: PlanLimit, isPremium: boolean): number {
  const tier = tierOf(isPremium);
  // free_daily_ai_limit is where the free AI limit was kept before plans existed
  const saved = settings[`limit_${tier}_${limit}`] ?? (limit === 'daily_ai_calls' && tier === 'free' ? settings['free_daily_ai_limit'] : undefined);
  const n = saved !== undefined ? parseInt(saved, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : PLAN_LIMITS[limit].defaults[tier];
}

/** Everything one account can use, for the app to show or lock features. */
export function planFor(settings: Record<string, string>, isPremium: boolean) {
  const features = Object.fromEntries(
    (Object.keys(PLAN_FEATURES) as PlanFeature[]).map(f => [f, canUse(settings, f, isPremium)]),
  ) as Record<PlanFeature, boolean>;
  const limits = Object.fromEntries(
    (Object.keys(PLAN_LIMITS) as PlanLimit[]).map(l => [l, limitFor(settings, l, isPremium)]),
  ) as Record<PlanLimit, number>;
  return { tier: tierOf(isPremium), features, limits };
}

export function lockedMessage(feature: PlanFeature) {
  return `${PLAN_FEATURES[feature].label} is part of Fennec Premium.`;
}
