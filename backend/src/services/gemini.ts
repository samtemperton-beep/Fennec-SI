import { GoogleGenAI } from '@google/genai';

function getClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
}

const MODEL = 'gemini-2.5-flash';

async function generate(prompt: string, maxTokens = 1024): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { maxOutputTokens: maxTokens },
  });
  return response.text ?? '';
}

function parseJSON<T>(text: string, fallback: T): T {
  const objMatch = text.match(/\{[\s\S]*\}/);
  const arrMatch = text.match(/\[[\s\S]*\]/);
  const match = objMatch || arrMatch;
  try { return match ? JSON.parse(match[0]) : fallback; } catch { return fallback; }
}

export async function analyzeStock(ticker: string, data: any) {
  const text = await generate(
    `You are a stock analyst. Analyze ${ticker} with this data: ${JSON.stringify(data)}.
Provide a JSON response with: signal (BUY/HOLD/SELL), confidence (1-10), reason (2 sentences), upside_pct (estimated % upside), risks (array of 2 short strings).`,
    512
  );
  return parseJSON(text, { signal: 'HOLD', reason: text, confidence: 5 });
}

export async function generateTop10(market: string, timeframe: string) {
  const text = await generate(
    `You are a stock analyst. Generate the top 10 stock picks for the ${market} market with a ${timeframe} timeframe.
Return a JSON array of 10 objects with: rank, ticker, name, sector, upside_pct, reason (2 sentences), risk_level (1-10).
Focus on real, well-known stocks. Be specific and actionable.`,
    2048
  );
  return parseJSON<any[]>(text, []);
}

export async function generateOpportunities(riskLevel: number, holdings: string[]) {
  const text = await generate(
    `You are an investment advisor. Generate 6 fresh stock opportunities for an investor with risk level ${riskLevel}/10.
Exclude these stocks already in their portfolio: ${holdings.join(', ')}.
Return a JSON array of 6 objects with: ticker, name, theme, reason (2 sentences), risk_level (1-10), upside_min_pct, upside_max_pct.`,
    1536
  );
  return parseJSON<any[]>(text, []);
}

export async function analyzeNews(headlines: string[], portfolio: string[]) {
  const text = await generate(
    `Analyze these financial news headlines and provide a brief digest for an investor holding: ${portfolio.join(', ')}.
Headlines: ${headlines.slice(0, 20).join('\n')}
Return JSON with: summary (3 sentences), sentiment (bullish/bearish/neutral), key_themes (array of 3 strings), portfolio_impact (string), action (string).`,
    1024
  );
  return parseJSON(text, { summary: text });
}

export async function analyzeIPO(ipoData: any) {
  const text = await generate(
    `Analyze this upcoming IPO and give an investment recommendation.
IPO Data: ${JSON.stringify(ipoData)}
Return JSON with: recommendation (STRONG_BUY/WATCH/SKIP), score (1-10), business_model (2 sentences), risks (array of 3 strings), valuation_analysis (2 sentences), action (string).`,
    1024
  );
  return parseJSON(text, { recommendation: 'WATCH', score: 5 });
}

export async function deepDive(ticker: string, context: string) {
  const text = await generate(
    `Provide a deep-dive analysis of ${ticker}. Context: ${context}
Return JSON with: what_happened (string), why_it_matters (string), portfolio_impact (string), what_to_watch (array of 3 strings), action_suggestion (string), signal (BUY/HOLD/SELL).`,
    1024
  );
  return parseJSON(text, { what_happened: text });
}

export async function draftPost(ticker: string, signal: string, context: string) {
  const text = await generate(
    `Draft a concise, engaging community post (max 280 chars) for a stock investment community about ${ticker} with a ${signal} signal. Context: ${context}. Be direct and specific.`,
    256
  );
  return text.trim();
}
