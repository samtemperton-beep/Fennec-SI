// The prompt for each AI feature. Despite the file name, each one runs on
// whichever model it's given: services/llm.ts sends it to Claude or Gemini.
import { complete, stream, HAIKU, SONNET, Message } from './llm';
import { APP_GUIDE } from './appGuide';

export const DEFAULT_MODEL = HAIKU;
export const HELPER_MODEL = SONNET;
const MODEL = DEFAULT_MODEL;

export async function analyzeStock(ticker: string, data: any, apiKey?: string, model?: string, riskLevel = 5) {
  const riskContext = riskLevel <= 3
    ? 'The investor is CONSERVATIVE — only recommend BUY for genuinely low-risk opportunities with strong fundamentals and limited downside. Prefer HOLD or SELL when uncertain.'
    : riskLevel <= 6
    ? 'The investor has a MODERATE risk tolerance — balance growth potential against downside risk in your recommendation.'
    : 'The investor is AGGRESSIVE — they accept high risk for high reward. Factor in growth potential and upside even if volatility is elevated.';
  const d = data || {};
  const context = [
    d.price != null ? `Price: $${d.price}` : '',
    d.changePctToday != null ? `Today: ${d.changePctToday > 0 ? '+' : ''}${d.changePctToday?.toFixed(2)}%` : '',
    d.pctFrom52Hi != null ? `vs 52w High: ${d.pctFrom52Hi?.toFixed(1)}%` : '',
    d.pctFrom52Lo != null ? `vs 52w Low: +${d.pctFrom52Lo?.toFixed(1)}%` : '',
    d.pe != null ? `P/E: ${d.pe?.toFixed(1)}` : '',
    d.marketCap != null ? `Mkt Cap: $${(d.marketCap / 1e9).toFixed(1)}B` : '',
    d.divYield != null ? `Div Yield: ${d.divYield?.toFixed(2)}%` : '',
    d.sector ? `Sector: ${d.sector}` : '',
  ].filter(Boolean).join(' | ');

  const prompt = `You are a decisive stock analyst giving a clear trading signal for ${ticker}.

Market data: ${context || JSON.stringify(d)}
${riskContext}

Rules:
- BUY if: near 52w lows with improving fundamentals, strong sector momentum, or P/E justified by growth
- SELL if: near 52w highs with no catalyst, overvalued P/E, deteriorating fundamentals
- HOLD only if genuinely mixed signals — do NOT default to HOLD
- Be specific — reference the actual numbers in your reason

Return JSON only: { "signal": "BUY"|"HOLD"|"SELL", "confidence": 1-10, "reason": "2 sentences referencing specific data points", "upside_pct": number, "risks": ["string","string"] }`;

  const text = await complete({ model: model || MODEL, maxTokens: 512, messages: [{ role: 'user', content: prompt }], apiKey });
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { signal: 'HOLD', reason: text, confidence: 5 };
  } catch {
    return { signal: 'HOLD', reason: text, confidence: 5 };
  }
}

export async function generateTop10(market: string, timeframe: string, apiKey?: string, newsContext?: string, rotationSeed?: number, model?: string) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const marketGuide = market === 'NZX'
    ? 'Only include stocks listed on the New Zealand Exchange (NZX). Use NZX tickers (e.g. FPH, AIR, ATM, MFT, SPK, SKT, ERD, MEL, CEN, VCT, SCL, SKO).'
    : market === 'ASX'
    ? 'Only include stocks listed on the Australian Securities Exchange (ASX). Append .AX to tickers (e.g. CBA.AX, BHP.AX, CSL.AX, WES.AX, NAB.AX, ANZ.AX, WBC.AX, MQG.AX, RIO.AX, TCL.AX).'
    : 'Focus on US-listed stocks (NYSE / NASDAQ). Mix of large-cap leaders and mid-cap momentum names.';

  const newsSection = newsContext
    ? `\n\nLATEST MARKET NEWS — weight picks heavily toward companies with active news catalysts:\n${newsContext}`
    : '';

  // Rotation seed drives sector emphasis so each press produces different results
  const seed = rotationSeed ?? 0;
  const SECTOR_ROTATIONS = [
    'Lean toward Technology, Healthcare, and Consumer Discretionary this cycle.',
    'Lean toward Energy, Financials, and Industrials this cycle.',
    'Lean toward Materials, Real Estate, and Consumer Staples this cycle.',
    'Lean toward Communications, Utilities, and Biotech this cycle.',
  ];
  const sectorHint = SECTOR_ROTATIONS[seed % SECTOR_ROTATIONS.length];

  const prompt = `You are a momentum-aware stock analyst generating today's top 10 picks. Date: ${today}.

MARKET: ${market}. ${marketGuide}
TIMEFRAME: ${timeframe} holding period.${newsSection}

SELECTION CRITERIA — rank these signals in order of importance:
1. TRENDING & SOCIAL MOMENTUM — stocks generating significant chatter on Reddit (r/wallstreetbets, r/investing, r/stocks), Twitter/X finance communities, and Stocktwits RIGHT NOW. These should feel like what traders are actually talking about today.
2. NEWS CATALYST — earnings beats, product launches, M&A rumours, regulatory wins, analyst upgrades published in the last 48 hours.
3. TECHNICAL SETUP — stocks near breakout levels, recent golden crosses, or high relative strength vs their sector.
4. FUNDAMENTAL VALUE — reasonable P/E or growth-adjusted valuation; not purely speculative.

DIVERSITY RULES:
- Maximum 2 picks from the same sector.
- ${sectorHint}
- Mix at least one speculative/high-momentum name (risk_level 7-9) with several safer names (risk_level 2-5).
- Do NOT default to the usual mega-caps (Apple, Microsoft, Google, Amazon) unless they have a specific active catalyst this week that makes them genuinely the best pick RIGHT NOW.

Return a JSON array of exactly 10 objects:
{ rank, ticker, name, sector, upside_pct (integer), reason (2 punchy sentences mentioning the specific catalyst or social momentum driving this pick), risk_level (1-10), trending_score (1-10, how hot this is on social/news) }

Be specific. Mention company names, products, events. Make each reason feel like it was written today, not a year ago.`;

  const text = await complete({ model: model || MODEL, maxTokens: 2048, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function generateOpportunities(
  riskLevel: number,
  holdings: string[],
  apiKey?: string,
  sector = 'All',
  market = 'US',
  newsContext?: string,
  userInterests?: { topSectors: string[]; topTickers: string[] },
  model?: string,
) {
  const sectorFilter = sector !== 'All' ? `Focus specifically on the ${sector} sector.` : 'Spread across different sectors.';
  const marketFilter = market === 'Global'
    ? 'Include stocks from any major global market (US, ASX, LSE, TSX, etc). Include the exchange in the ticker field, e.g. CBA.AX for ASX.'
    : market === 'ASX'
    ? 'Only include stocks listed on the Australian Securities Exchange (ASX). Use .AX suffix on tickers.'
    : market === 'NZX'
    ? 'Only include stocks listed on the New Zealand Exchange (NZX).'
    : 'Only include stocks listed on US exchanges (NYSE, NASDAQ).';

  const interestSection = userInterests?.topSectors?.length
    ? `\nThis investor has shown interest in these sectors: ${userInterests.topSectors.join(', ')}. Weight picks accordingly.`
    : '';

  const newsSection = newsContext
    ? `\n\nLatest market news — use this to find emerging opportunities and timely catalysts:\n${newsContext}`
    : '';

  const prompt = `You are a specialist stock researcher focused on finding under-the-radar investment opportunities.
Generate 6 hidden gem stock picks for an investor with risk level ${riskLevel}/10.
${sectorFilter} ${marketFilter}${interestSection}${newsSection}
Exclude these stocks already in their portfolio: ${holdings.join(', ') || 'none'}.

IMPORTANT RULES:
- Prefer small-cap and mid-cap stocks (under $10B market cap) that are NOT commonly discussed
- Each pick must have a specific upcoming catalyst (earnings, product launch, regulatory approval, etc.)
- Do NOT pick the same stocks as typical "top 10" lists (no AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA)
- Focus on genuine research depth — obscure but real, publicly traded companies
- Where the news context reveals an emerging theme or trend, prioritise picks that benefit from it

Return a JSON array of 6 objects with these exact fields:
ticker, name, market (US/ASX/NZX/LSE/etc), sector, market_cap_category (Small/Mid/Large),
theme (3-5 word investment thesis), why_under_radar (1 sentence — why most investors miss this),
catalyst (1 sentence — specific upcoming trigger), time_horizon (Short/Medium/Long),
reason (2 sentences of analysis), risk_level (1-10), upside_min_pct, upside_max_pct`;

  const text = await complete({ model: model || MODEL, maxTokens: 2048, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function analyzeNews(headlines: string[], portfolio: string[], apiKey?: string, model?: string) {
  const prompt = `Analyze these financial news headlines and provide a brief digest for an investor holding: ${portfolio.join(', ')}.
Headlines: ${headlines.slice(0, 20).join('\n')}
Return JSON with: summary (3 sentences), sentiment (bullish/bearish/neutral), key_themes (array of 3 strings), portfolio_impact (string), action (string).`;

  const text = await complete({ model: model || MODEL, maxTokens: 1024, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };
}

export async function analyzeIPO(ipoData: any, apiKey?: string, model?: string) {
  const prompt = `Analyze this upcoming IPO and give an investment recommendation.
IPO Data: ${JSON.stringify(ipoData)}
Return JSON with: recommendation (STRONG_BUY/WATCH/SKIP), score (1-10), business_model (2 sentences), risks (array of 3 strings), valuation_analysis (2 sentences), action (string).`;

  const text = await complete({ model: model || MODEL, maxTokens: 1024, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: 'WATCH', score: 5 };
}

export async function deepDive(ticker: string, context: string, apiKey?: string, model?: string) {
  const prompt = `Provide a deep-dive analysis of ${ticker}. Context: ${context}
Return JSON with: what_happened (string), why_it_matters (string), portfolio_impact (string), what_to_watch (array of 3 strings), action_suggestion (string), signal (BUY/HOLD/SELL).`;

  const text = await complete({ model: model || MODEL, maxTokens: 1024, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { what_happened: text };
}

export interface SavingsTip {
  title: string;
  saving: number;
  detail: string;
  action: string;
  category: 'subscriptions' | 'dining' | 'groceries' | 'phone' | 'debt' | 'general';
}

export async function generateSavingsTips(
  spendData: {
    byCategory: Record<string, number>;
    subscriptions: { name: string; amount: number }[];
    totalExpenses: number;
    totalIncome: number;
  },
  apiKey?: string,
  model?: string
): Promise<SavingsTip[]> {
  const catLines = Object.entries(spendData.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => `${cat}: $${Math.round(amount)}/mo`)
    .join('\n');

  const subLine = spendData.subscriptions.length > 0
    ? `\nSubscriptions: ${spendData.subscriptions.map(s => `${s.name} $${s.amount}`).join(', ')}`
    : '';

  const incomeExpense = spendData.totalIncome > 0
    ? `\nMonthly income: $${Math.round(spendData.totalIncome)} | Total expenses: $${Math.round(spendData.totalExpenses)} | Savings rate: ${Math.round(((spendData.totalIncome - spendData.totalExpenses) / spendData.totalIncome) * 100)}%`
    : `\nTotal expenses: $${Math.round(spendData.totalExpenses)}/mo`;

  const prompt = `You are a sharp personal finance advisor. Analyse this person's actual spending data and generate 4–6 specific, actionable savings tips — each with a concrete dollar saving estimate.

SPENDING DATA:
${catLines}${subLine}${incomeExpense}

For each tip:
- Reference the actual numbers from the data
- For subscriptions: name each service, its amount, and the rotation strategy specifically
- Give a realistic monthly saving in dollars (not a range — pick the midpoint)
- Keep the action step concrete and achievable this week
- Do NOT invent categories or amounts not in the data

Return JSON array only:
[{ "title": "short title", "saving": 45, "detail": "2 sentences with specific amounts from the data", "action": "one concrete step to take this week", "category": "subscriptions|dining|groceries|phone|debt|general" }]

Sort by saving amount descending. Max 6 tips.`;

  const text = await complete({ model: model || MODEL, maxTokens: 1024, messages: [{ role: 'user', content: prompt }], apiKey });
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function draftPost(ticker: string, signal: string, context: string, apiKey?: string, model?: string) {
  const view = /bull/i.test(signal) ? 'positive' : /bear/i.test(signal) ? 'negative' : 'neutral';
  const prompt = `Draft a short community post (max 280 characters) for a New Zealand investing community, written in the first person, about ${ticker}. The writer's own view is ${view}. Context: ${context}.
Frame it as the writer's personal opinion and reasons, not a recommendation. Don't tell others to buy or sell, don't give price targets or promise returns, and don't invent figures or news. Plain text only, no hashtags.`;

  const text = await complete({ model: model || MODEL, maxTokens: 256, messages: [{ role: 'user', content: prompt }], apiKey });
  return text.trim();
}

export interface HelperContext {
  pageHint?: string;
  // Investing
  portfolioSummary?: string;
  watchlistSummary?: string;
  recentNews?: string[];
  // Finance
  accountsSummary?: string;
  monthlySpend?: string;
  goalsSummary?: string;
  kiwiSaverSummary?: string;
  savingsSummary?: string;
  aboutSummary?: string;
  rentalSummary?: string;
  /** Added by the server from bank_sync_health, never from the browser. */
  connectionSummary?: string;
}

export async function* streamHelper(messages: Message[], apiKey?: string, context?: HelperContext, model?: string) {

  const portfolioSection = context?.portfolioSummary
    ? `\n\nUSER'S PORTFOLIO (live positions):\n${context.portfolioSummary}`
    : '';

  const watchlistSection = context?.watchlistSummary
    ? `\n\nUSER'S WATCHLIST:\n${context.watchlistSummary}`
    : '';

  const newsSection = context?.recentNews?.length
    ? `\n\nRECENT MARKET NEWS (last 24-48 hours):\n${context.recentNews.slice(0, 25).map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  const accountsSection = context?.accountsSummary
    ? `\n\nUSER'S BANK ACCOUNTS:\n${context.accountsSummary}`
    : '';

  const spendSection = context?.monthlySpend
    ? `\n\nUSER'S SPENDING THIS MONTH:\n${context.monthlySpend}`
    : '';

  const goalsSection = context?.goalsSummary
    ? `\n\nUSER'S SAVINGS GOALS:\n${context.goalsSummary}`
    : '';

  const kiwiSaverSection = context?.kiwiSaverSummary
    ? `\n\nUSER'S KIWISAVER:\n${context.kiwiSaverSummary}`
    : '';

  const savingsSection = context?.savingsSummary
    ? `

USER'S SAVINGS (and how they compare with investing and KiwiSaver, as on the Savings page):
${String(context.savingsSummary).slice(0, 3000)}`
    : '';

  const aboutSection = context?.aboutSummary
    ? `

ABOUT THE USER (what they chose to tell Fennec):
${String(context.aboutSummary).slice(0, 600)}`
    : '';

  const connectionSection = context?.connectionSummary
    ? `\n\nUSER'S BANK CONNECTION STATUS (from Fennec's last syncs; use it for questions about syncing, missing or old transactions, or Akahu):\n${String(context.connectionSummary).slice(0, 2500)}`
    : '';

  const rentalSection = context?.rentalSummary
    ? `\n\nUSER'S RENTAL PROPERTIES (from Finance → Rental):\n${String(context.rentalSummary).slice(0, 3000)}`
    : '';

  // Page-specific focus hint
  const pageHints: Record<string, string> = {
    portfolio: 'The user is viewing their investment portfolio. Prioritise portfolio analysis, stock signals, and position-level insights.',
    watchlist: 'The user is viewing their watchlist. Focus on entry opportunities, valuation, and signals for stocks they are watching.',
    news: 'The user is on the news page. Focus on how current market events relate to their holdings and macro trends.',
    finance: 'The user is in the household finance section. Focus on budgeting, spending, savings, and NZ personal finance.',
    budget: 'The user is viewing their budget. Help them understand their spending patterns, whether they are on track, and how to optimise.',
    transactions: 'The user is viewing their transactions. Focus on spending analysis, category trends, and cash flow.',
    bills: 'The user is viewing their recurring bills. Help them manage, reduce, or negotiate household costs.',
    goals: 'The user is viewing their savings goals. Focus on goal progress, strategies to accelerate savings, and prioritisation. When asked for goal ideas, suggest 3-5 specific goals with a target amount, a timeframe and the monthly amount that needs, using their spending, savings, age range and what they are working towards; usually an emergency fund and clearing high-interest debt come first.',
    savings: 'The user is viewing their Savings page: savings balance, interest earned, RWT, a 5-10 year projection, and a comparison of savings, investing and KiwiSaver. Use their figures. When comparing, weigh return against risk, access and time: an emergency fund (often 3-6 months of expenses) usually belongs in savings; KiwiSaver gets employer and government money but is locked in until 65 or a first home; shares have higher expected returns but can fall, so they suit money not needed for 5+ years. Check their RWT rate against their income (10.5% up to $15,600, 17.5% to $53,500, 30% to $78,100, 33% to $180,000, 39% above): too high a rate is refunded at year end, too low means tax to pay. Mention that paying down high-interest debt often beats saving. Say what their numbers suggest, then the trade-offs.',
    kiwisaver: 'The user is viewing their KiwiSaver. Focus on NZ retirement planning: contribution rates, fund types, government MTC, and projected outcomes.',
    rental: 'The user is viewing their rental property page. Use their rental figures: rent against mortgage repayments and other costs, yield, equity, rent arrival. NZ rental tax (general information, not tax advice): rental income and expenses go on the IR3 with an IR3R schedule per property; the tax year runs 1 April to 31 March. Deductible: rates, insurance, repairs and maintenance (not improvements, which are capital), property management and letting fees, accounting and legal fees, body corporate levies, interest. Interest deductibility for residential rentals (loans from before 27 March 2021): 75% in 2022-23, 50% in 2023-24, 80% in 2024-25, 100% from 1 April 2025; new builds (code compliance from 27 March 2020) are fully deductible. Principal repayments are never deductible. Residential rental losses are ring-fenced: they carry forward to future rental income and cannot reduce tax on salary. Bright-line: residential property sold within 2 years of purchase (sales from 1 July 2024) can be taxable. Buildings cannot be depreciated; chattels can. If figures look incomplete, point out uncategorised transactions. Suggest an accountant for anything specific.',
    dashboard: 'The user is on their financial dashboard. Give holistic advice covering both their investments and household finances.',
  };
  const pageFocus = context?.pageHint && pageHints[context.pageHint]
    ? `\n\n**CURRENT CONTEXT:** ${pageHints[context.pageHint]}`
    : '';

  const system = `You are Fennec, an expert AI financial assistant built into Fennec SI (Save & Invest), a personal finance and investing app. You understand both investing and everyday household finances. You are not a licensed financial adviser and don't present yourself as one.

**Investing expertise**: Equities (US/ASX/NZX), ETFs, fixed income, options, commodities. Fundamental analysis (P/E, DCF, ROIC, free cash flow), technical analysis (RSI, MACD, moving averages, support/resistance), and macro economics (Fed, RBNZ, inflation, yield curve, credit markets).

**Personal finance expertise**: Budgeting, cash flow management, debt reduction, savings strategies, NZ-specific knowledge (KiwiSaver, PIE funds, IRD, NZ tax system, RBNZ OCR, NZ property market, NZ cost of living). Understanding of household financial planning, net worth building, and retirement planning.

**NZ context**: You understand NZ-specific financial products, regulations, and norms. KiwiSaver contribution rates (3/4/6/8/10%), employer matching, government contribution (25c per $1 the member puts in, up to $260.72 a year since 1 July 2025; not paid on income over $180,000), PIE tax rates, NZ Super at 65, and NZ bank products.

**Savings & spending strategies** (draw on these when analysing the user's spending data or answering budgeting questions):

*Subscription rotation*: Streaming services (Netflix, Disney+, Apple TV+, Neon, Binge, Paramount+, Stan, Sky Sport, YouTube Premium) often have overlapping content. Strategy: keep 1–2 core services year-round (the most-watched), and rotate the rest — subscribe one month, binge the content you want, cancel, pick up another next month. Most services have no penalty for rejoining. Example: keeping Netflix + Spotify year-round while rotating Disney+ ($20), Apple TV+ ($13) and Neon ($20) monthly saves ~$33–53/month ($396–636/year). When a user has 3+ streaming services, always flag this.

*The 50/30/20 rule*: 50% needs (rent, groceries, utilities, transport, insurance, minimum debt payments), 30% wants (dining, entertainment, subscriptions, shopping), 20% savings/debt reduction. In Auckland/Wellington/Sydney where housing is 35–45% of take-home, adjust to 60% needs, 20% wants, 20% savings. If a user's savings rate is below 10%, flag it; below 5% is concerning.

*The small-spend multiplier*: $5 coffee daily = $1,825/year. $12 work lunch = $3,120/year. $25 Uber Eats twice a week = $2,600/year. Total: $7,545/year on easily-reducible spending. Even cutting each by half frees $3,772/year — a significant holiday or investment boost.

*Grocery savings (NZ)*: Pak'nSave is typically 15–25% cheaper than New World or Countdown on the same basket. Buying dry goods in bulk at Costco (Auckland, Wellington) saves 20–30%. Own-brand/home-brand products are 20–40% cheaper with comparable quality. A weekly meal plan before shopping reduces waste ~30%. If someone spends over $600/month on groceries for a couple, suggest Pak'nSave and meal planning.

*Phone plans (NZ)*: 2degrees and Skinny offer plans from $14–$25/month with adequate data. Switching from a $60/month major carrier saves ~$480/year. Family plans add further discounts. Recommend reviewing every 12 months; contract lock-ins rarely offer better value.

*Power (NZ)*: Compare annually at powerswitch.org.nz. Switching providers typically saves $200–$400/year. Flick Electric (spot pricing) can be cheaper for people who shift usage off-peak. A hot water timer (heating only 2–3 hours/day) saves ~$15–$30/month.

*Debt priority*: Pay minimums on all debts; direct extra to: (1) Avalanche — highest interest rate first (mathematically optimal); (2) Snowball — smallest balance first (psychologically motivating). Credit card debt at 20% APR is equivalent to a guaranteed 20% return — always pay this off before investing, except getting your KiwiSaver employer match first (that's a 100% instant return).

*Emergency fund*: Target 3–6 months of essential expenses in a separate high-interest account (Heartland Bank Online Saver, ASB Online Saver, Rabobank). Automate a fixed transfer every payday. If someone has no emergency fund and variable income, 6 months is safer.

*When analysing spending data*: Quote the user's actual numbers — never estimate or invent figures. Identify the top 2–3 biggest reduction opportunities by $ amount. For subscriptions, list each service and its amount explicitly, then calculate the rotation saving. Be direct: "You could save $X by doing Y" not "you might consider possibly...".${pageFocus}${portfolioSection}${watchlistSection}${newsSection}${accountsSection}${spendSection}${goalsSection}${kiwiSaverSection}${savingsSection}${aboutSection}${rentalSection}${connectionSection}

**How to respond:**
- Give expert, specific, actionable answers, like a knowledgeable friend who works in finance
- Reference the user's actual data when answering (their portfolio, accounts, goals, KiwiSaver, savings)
- Be direct and confident; don't hedge everything into vagueness
- Use **bold** for key figures and terms; bullet points for lists
- Keep responses focused: 150-250 words unless depth is genuinely needed
- For NZ-specific questions, use NZD and NZ context by default
- Always note this is information and analysis, not regulated financial advice (not needed for questions about using the app)

${APP_GUIDE}`;

  yield* stream({ model: model || HELPER_MODEL, maxTokens: 1024, system, messages, apiKey });
}

export async function* streamChat(messages: Message[], portfolio: string[], apiKey?: string, model?: string) {
  const system = `You are Fennec SI, an expert investment advisor. The user's portfolio includes: ${portfolio.join(', ')}.
Provide concise, actionable investment advice. Use specific numbers and data. Be direct and helpful.`;

  yield* stream({ model: model || MODEL, maxTokens: 1024, system, messages, apiKey });
}

// ── Dashboard daily summary ───────────────────────────────────────────────────

export function dailySummaryPrompt(facts: unknown) {
  return `You are Fennec, the friendly fox who looks after this person's money in the Fennec app (New Zealand, NZD).

Here is today's snapshot of their finances as JSON:
${JSON.stringify(facts)}

Write their daily briefing:
- 2 to 3 short sentences, under 70 words in total, plain text (no markdown, no lists, no emoji)
- Lead with the single most important thing (anything overdue, over budget or past a threshold), then how things are tracking overall
- Use the actual numbers from the snapshot; never invent figures or items that aren't in it
- Warm and direct, NZ English, speak to them as "you"
- Don't tell them to buy or sell any particular investment
- If there's nothing pressing, say so and mention one thing that's going well`;
}

export async function dailySummary(facts: unknown, apiKey?: string, model?: string): Promise<string> {
  const text = await complete({ model: model || MODEL, maxTokens: 300, messages: [{ role: 'user', content: dailySummaryPrompt(facts) }], apiKey });
  return text.trim();
}

// ── Setup help (onboarding) ───────────────────────────────────────────────────

const SETUP_HELP_SYSTEM = `You are Fennec, a friendly fox helping someone connect their accounts while signing up to the Fennec app (New Zealand). Most people here aren't technical. Keep replies short: 2 to 5 sentences or a short numbered list, plain English, no jargon, no markdown headings.

What they are doing: Fennec connects to banks, brokers and KiwiSaver through Akahu, a NZ open finance company. Each person creates their own free "personal app" at Akahu, which gives them two tokens to paste into Fennec.

The steps, from Akahu's documentation:
1. Go to my.akahu.nz and create an Akahu profile (email address, then follow the prompts).
2. Connect a first bank account to that profile. This is required before step 3 works.
3. Sign in to Akahu, open the menu (three lines at the top left; it lists Apps, Profile, Developers, Logout) and choose Developers, or go to my.akahu.nz/developers. The "My apps" page is different: it only lists apps they have approved, so it can look empty.
4. Agree to Akahu's Developer Terms the first time.
5. Set up multi-factor authentication, which Akahu requires. An authenticator app such as Google Authenticator or Microsoft Authenticator works for that kind of step.
6. Akahu then shows two tokens: the "User Access Token" and the "App ID Token". If it asks for an app name, "My Finances" is fine.
7. Back in Fennec, paste the App ID Token and User Access Token into the matching boxes and press Connect Akahu.

Good to know:
- It's free for personal use. A personal app only sees that person's own accounts.
- Akahu refreshes data once a day, so new balances can take a while to appear.
- Akahu has read-only access for this: Fennec can't move money.
- Business accounts sometimes use a separate bank login; the bank may need to link them to the personal login first.
- Supported banks: ANZ, ASB, BNZ, Kiwibank, Westpac, TSB, The Co-operative Bank, Heartland, NZHL, SBS, Rabobank (agribusiness accounts only).
- Supported investing: Hatch, Sharesies, Stake, Kernel Wealth, Sharesight, Simplicity, Milford, Booster, Fisher Funds, Generate, SuperLife, Pie Funds. Also American Express, Gem Visa, Wise.

Rules:
- Never ask for, or accept, passwords, tokens or authentication codes. If someone pastes one, tell them not to share it and to paste it into the boxes in Fennec instead.
- You can't see their screen. If you're not sure what a screen shows, say so and ask what they can see.
- Only give what's above. Don't invent button names, menus or URLs. If you don't know, say so and suggest Akahu's support, or skipping this step: they can press "I'll do this later" and connect from Settings any time.
- Stay on setting up Fennec and Akahu. Don't give investment advice.`;

export async function setupHelp(messages: { role: 'user' | 'assistant'; content: string }[], model?: string): Promise<string> {
  const text = await complete({ model: model || MODEL, maxTokens: 400, system: SETUP_HELP_SYSTEM, messages });
  return text.trim();
}
