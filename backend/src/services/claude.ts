import Anthropic from '@anthropic-ai/sdk';

function getClient(apiKey?: string) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

const MODEL = 'claude-haiku-4-5-20251001';

export async function analyzeStock(ticker: string, data: any, apiKey?: string) {
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
    model: MODEL,
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

export async function generateTop10(market: string, timeframe: string, apiKey?: string, newsContext?: string, rotationSeed?: number) {
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
    model: MODEL,
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
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function analyzeNews(headlines: string[], portfolio: string[], apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `Analyze these financial news headlines and provide a brief digest for an investor holding: ${portfolio.join(', ')}.
Headlines: ${headlines.slice(0, 20).join('\n')}
Return JSON with: summary (3 sentences), sentiment (bullish/bearish/neutral), key_themes (array of 3 strings), portfolio_impact (string), action (string).`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };
}

export async function analyzeIPO(ipoData: any, apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `Analyze this upcoming IPO and give an investment recommendation.
IPO Data: ${JSON.stringify(ipoData)}
Return JSON with: recommendation (STRONG_BUY/WATCH/SKIP), score (1-10), business_model (2 sentences), risks (array of 3 strings), valuation_analysis (2 sentences), action (string).`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: 'WATCH', score: 5 };
}

export async function deepDive(ticker: string, context: string, apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `Provide a deep-dive analysis of ${ticker}. Context: ${context}
Return JSON with: what_happened (string), why_it_matters (string), portfolio_impact (string), what_to_watch (array of 3 strings), action_suggestion (string), signal (BUY/HOLD/SELL).`;

  const msg = await client.messages.create({
    model: MODEL,
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

export async function* streamHelper(messages: any[], apiKey?: string) {
  const client = getClient(apiKey);
  const system = `You are Fennec, a friendly stock market educator built into the Fennec SI investment platform. Your role is to explain financial terms, answer basic investing questions, and help users understand stock market concepts.

Guidelines:
- Keep answers concise and plain-English — no jargon without explanation
- When explaining a term, give a short definition then a real-world example
- If asked about specific stocks, give educational context only (not personalised financial advice)
- Cover topics like: P/E ratios, EPS, market cap, dividends, ETFs, indices, options, technical indicators, etc.
- Be encouraging and approachable — many users are beginners
- For complex topics, break it into 2-3 short paragraphs max
- Never give personalised buy/sell recommendations`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 512,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function* streamChat(messages: any[], portfolio: string[], apiKey?: string) {
  const client = getClient(apiKey);
  const system = `You are Fennec SI, an expert investment advisor. The user's portfolio includes: ${portfolio.join(', ')}.
Provide concise, actionable investment advice. Use specific numbers and data. Be direct and helpful.`;

  const stream = client.messages.stream({
    model: MODEL,
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
