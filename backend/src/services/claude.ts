import Anthropic from '@anthropic-ai/sdk';

function getClient(apiKey?: string) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

const MODEL = 'claude-haiku-4-5-20251001';

export async function analyzeStock(ticker: string, data: any, apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `You are a stock analyst. Analyze ${ticker} with this data: ${JSON.stringify(data)}.
Provide a JSON response with: signal (BUY/HOLD/SELL), confidence (1-10), reason (2 sentences), upside_pct (estimated % upside), risks (array of 2 short strings).`;

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

export async function generateTop10(market: string, timeframe: string, apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `You are a stock analyst. Generate the top 10 stock picks for the ${market} market with a ${timeframe} timeframe.
Return a JSON array of 10 objects with: rank, ticker, name, sector, upside_pct, reason (2 sentences), risk_level (1-10).
Focus on real, well-known stocks. Be specific and actionable.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as any).text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

export async function generateOpportunities(riskLevel: number, holdings: string[], apiKey?: string) {
  const client = getClient(apiKey);
  const prompt = `You are an investment advisor. Generate 6 fresh stock opportunities for an investor with risk level ${riskLevel}/10.
Exclude these stocks already in their portfolio: ${holdings.join(', ')}.
Return a JSON array of 6 objects with: ticker, name, theme, reason (2 sentences), risk_level (1-10), upside_min_pct, upside_max_pct.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
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
