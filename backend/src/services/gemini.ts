import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey: key });
}

async function generate(prompt: string, maxTokens = 1024, attempt = 0): Promise<string> {
  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { maxOutputTokens: maxTokens },
    });
    return response.text ?? '';
  } catch (e: any) {
    if (attempt < 2 && (e?.status === 503 || e?.status === 429)) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      return generate(prompt, maxTokens, attempt + 1);
    }
    throw e;
  }
}

function parseJSON<T>(text: string, fallback: T): T {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  const match = objMatch || arrMatch;
  try { return match ? JSON.parse(match[0]) : fallback; } catch { return fallback; }
}

// --- Simple features routed to Gemini ---

export async function analyzeStock(ticker: string, data: any, riskLevel = 5) {
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

  const text = await generate(
    `You are a decisive stock analyst giving a clear trading signal for ${ticker}.

Market data: ${context || JSON.stringify(d)}
${riskContext}

Rules:
- BUY if: near 52w lows with improving fundamentals, strong sector momentum, or P/E justified by growth
- SELL if: near 52w highs with no catalyst, overvalued P/E, deteriorating fundamentals
- HOLD only if genuinely mixed signals — do NOT default to HOLD
- Be specific — reference the actual numbers in your reason

Return JSON only: { "signal": "BUY"|"HOLD"|"SELL", "confidence": 1-10, "reason": "2 sentences referencing specific data points", "upside_pct": number, "risks": ["string","string"] }`,
    512
  );
  return parseJSON(text, { signal: 'HOLD', reason: text, confidence: 5 });
}

export async function analyzeIPO(ipoData: any) {
  const text = await generate(
    `Analyze this upcoming IPO: ${JSON.stringify(ipoData)}
Return JSON only: { "recommendation": "STRONG_BUY"|"WATCH"|"SKIP", "score": 1-10, "business_model": "2 sentences", "risks": ["s","s","s"], "valuation_analysis": "2 sentences", "action": "string" }`,
    1024
  );
  return parseJSON(text, { recommendation: 'WATCH', score: 5 });
}

export async function draftPost(ticker: string, signal: string, context: string) {
  const text = await generate(
    `Draft a concise community post (max 280 chars) about ${ticker} with a ${signal} signal. Context: ${context}. Be direct and specific. No hashtags.`,
    256
  );
  return text.trim();
}

export async function* streamHelper(messages: any[], context?: { portfolioSummary?: string; watchlistSummary?: string; recentNews?: string[] }) {
  const client = getClient();

  const portfolioSection = context?.portfolioSummary ? `\n\nUser's portfolio: ${context.portfolioSummary}` : '';
  const watchlistSection = context?.watchlistSummary ? `\n\nUser's watchlist: ${context.watchlistSummary}` : '';
  const newsSection = context?.recentNews?.length ? `\n\nRecent news (use to answer current questions):\n${context.recentNews.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '';

  const system = `You are Fennec, an expert financial analyst built into the Fennec SI investment platform. You have deep knowledge of equity markets, macroeconomics, fundamental and technical analysis, ETFs, bonds, and global markets (US, ASX, NZX). Give specific, data-driven answers like a senior portfolio manager. Reference the user's actual holdings and current news when relevant. Use bold for key terms and bullet points for lists. Be direct and confident. 150-250 words unless more depth is genuinely needed. Note this is information, not personal financial advice.${portfolioSection}${watchlistSection}${newsSection}`;

  const history = messages.slice(0, -1).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const lastMsg = messages[messages.length - 1];

  const chat = client.chats.create({
    model: MODEL,
    config: { systemInstruction: system, maxOutputTokens: 512 },
    history,
  });

  const stream = await chat.sendMessageStream({ message: lastMsg.content });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
