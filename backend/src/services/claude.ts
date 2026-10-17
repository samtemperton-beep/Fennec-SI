import Anthropic from '@anthropic-ai/sdk';

function getClient(apiKey?: string) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const HELPER_MODEL = 'claude-sonnet-4-6';
const MODEL = DEFAULT_MODEL;

export async function analyzeStock(ticker: string, data: any, apiKey?: string, model?: string) {
  const client = getClient(apiKey);
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

Rules:
- BUY if: near 52w lows with improving fundamentals, strong sector momentum, or P/E justified by growth
- SELL if: near 52w highs with no catalyst, overvalued P/E, deteriorating fundamentals
- HOLD only if genuinely mixed signals — do NOT default to HOLD
- Be specific — reference the actual numbers in your reason

Return JSON only: { "signal": "BUY"|"HOLD"|"SELL", "confidence": 1-10, "reason": "2 sentences referencing specific data points", "upside_pct": number, "risks": ["string","string"] }`;

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { signal: 'HOLD', reason: text, confidence: 5 };
  } catch {
    return { signal: 'HOLD', reason: text, confidence: 5 };
  }
}

export async function generateTop10(market: string, timeframe: string, apiKey?: string, newsContext?: string, rotationSeed?: number, model?: string) {
  const client = getClient(apiKey);
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

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
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
  const client = getClient(apiKey);
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

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function analyzeNews(headlines: string[], portfolio: string[], apiKey?: string, model?: string) {
  const client = getClient(apiKey);
  const prompt = `Analyze these financial news headlines and provide a brief digest for an investor holding: ${portfolio.join(', ')}.
Headlines: ${headlines.slice(0, 20).join('\n')}
Return JSON with: summary (3 sentences), sentiment (bullish/bearish/neutral), key_themes (array of 3 strings), portfolio_impact (string), action (string).`;

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };
}

export async function analyzeIPO(ipoData: any, apiKey?: string, model?: string) {
  const client = getClient(apiKey);
  const prompt = `Analyze this upcoming IPO and give an investment recommendation.
IPO Data: ${JSON.stringify(ipoData)}
Return JSON with: recommendation (STRONG_BUY/WATCH/SKIP), score (1-10), business_model (2 sentences), risks (array of 3 strings), valuation_analysis (2 sentences), action (string).`;

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: 'WATCH', score: 5 };
}

export async function deepDive(ticker: string, context: string, apiKey?: string, model?: string) {
  const client = getClient(apiKey);
  const prompt = `Provide a deep-dive analysis of ${ticker}. Context: ${context}
Return JSON with: what_happened (string), why_it_matters (string), portfolio_impact (string), what_to_watch (array of 3 strings), action_suggestion (string), signal (BUY/HOLD/SELL).`;

  const msg = await client.messages.create({
    model: model || MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { what_happened: text };
}

export async function draftPost(ticker: string, signal: string, context: string, apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `Draft a concise, engaging community post (max 280 chars) for a stock investment community about ${ticker} with a ${signal} signal. Context: ${context}. Be direct and specific.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  return (msg.content[0] as any).text.trim();
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
}

export async function* streamHelper(messages: any[], apiKey?: string, context?: HelperContext, model?: string) {
  const client = getClient(apiKey);

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

  // Page-specific focus hint
  const pageHints: Record<string, string> = {
    portfolio: 'The user is viewing their investment portfolio. Prioritise portfolio analysis, stock signals, and position-level insights.',
    watchlist: 'The user is viewing their watchlist. Focus on entry opportunities, valuation, and signals for stocks they are watching.',
    news: 'The user is on the news page. Focus on how current market events relate to their holdings and macro trends.',
    finance: 'The user is in the household finance section. Focus on budgeting, spending, savings, and NZ personal finance.',
    budget: 'The user is viewing their budget. Help them understand their spending patterns, whether they are on track, and how to optimise.',
    transactions: 'The user is viewing their transactions. Focus on spending analysis, category trends, and cash flow.',
    bills: 'The user is viewing their recurring bills. Help them manage, reduce, or negotiate household costs.',
    goals: 'The user is viewing their savings goals. Focus on goal progress, strategies to accelerate savings, and prioritisation.',
    kiwisaver: 'The user is viewing their KiwiSaver. Focus on NZ retirement planning: contribution rates, fund types, government MTC, and projected outcomes.',
    dashboard: 'The user is on their financial dashboard. Give holistic advice covering both their investments and household finances.',
  };
  const pageFocus = context?.pageHint && pageHints[context.pageHint]
    ? `\n\n**CURRENT CONTEXT:** ${pageHints[context.pageHint]}`
    : '';

  const system = `You are Fennec, an expert AI financial adviser embedded in the Fennec personal finance and investment platform. You are a trusted adviser who understands both investing and everyday household finances.

**Investing expertise**: Equities (US/ASX/NZX), ETFs, fixed income, options, commodities. Fundamental analysis (P/E, DCF, ROIC, free cash flow), technical analysis (RSI, MACD, moving averages, support/resistance), and macro economics (Fed, RBNZ, inflation, yield curve, credit markets).

**Personal finance expertise**: Budgeting, cash flow management, debt reduction, savings strategies, NZ-specific knowledge (KiwiSaver, PIE funds, IRD, NZ tax system, RBNZ OCR, NZ property market, NZ cost of living). Understanding of household financial planning, net worth building, and retirement planning.

**NZ context**: You understand NZ-specific financial products, regulations, and norms. KiwiSaver contribution rates (3/4/6/8/10%), employer matching, government MTC ($521.43/year max), PIE tax rates, NZ Super at 65, and NZ bank products.${pageFocus}${portfolioSection}${watchlistSection}${newsSection}${accountsSection}${spendSection}${goalsSection}${kiwiSaverSection}

**How to respond:**
- Give expert, specific, actionable answers — like a trusted financial adviser talking to a client
- Reference the user's actual data when answering (their portfolio, accounts, goals, KiwiSaver)
- Be direct and confident; don't hedge everything into vagueness
- Use **bold** for key figures and terms; bullet points for lists
- Keep responses focused: 150-250 words unless depth is genuinely needed
- For NZ-specific questions, use NZD and NZ context by default
- Always note this is information and analysis, not regulated financial advice`;

  const stream = client.messages.stream({
    model: model || HELPER_MODEL,
    max_tokens: 1024,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function* streamChat(messages: any[], portfolio: string[], apiKey?: string, model?: string) {
  const client = getClient(apiKey);
  const system = `You are Fennec SI, an expert investment advisor. The user's portfolio includes: ${portfolio.join(', ')}.
Provide concise, actionable investment advice. Use specific numbers and data. Be direct and helpful.`;

  const stream = client.messages.stream({
    model: model || MODEL,
    max_tokens: 1024,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
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
  const msg = await getClient(apiKey).messages.create({
    model: model || MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: dailySummaryPrompt(facts) }],
  });
  return ((msg.content[0] as any)?.text ?? '').trim();
}
