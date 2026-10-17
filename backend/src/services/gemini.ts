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

export async function* streamHelper(messages: any[], context?: { pageHint?: string; portfolioSummary?: string; watchlistSummary?: string; recentNews?: string[]; accountsSummary?: string; monthlySpend?: string; goalsSummary?: string; kiwiSaverSummary?: string }) {
  const client = getClient();

  const sections = [
    context?.portfolioSummary ? `\nPortfolio: ${context.portfolioSummary}` : '',
    context?.watchlistSummary ? `\nWatchlist: ${context.watchlistSummary}` : '',
    context?.recentNews?.length ? `\nRecent news:\n${context.recentNews.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
    context?.accountsSummary ? `\nBank accounts: ${context.accountsSummary}` : '',
    context?.monthlySpend ? `\nSpending: ${context.monthlySpend}` : '',
    context?.goalsSummary ? `\nSavings goals: ${context.goalsSummary}` : '',
    context?.kiwiSaverSummary ? `\nKiwiSaver: ${context.kiwiSaverSummary}` : '',
  ].join('');

  const system = `You are Fennec, an expert AI financial adviser for NZ users. You cover both investing (equities, ETFs, macro, US/ASX/NZX markets) and personal finance (budgeting, savings, KiwiSaver, NZ tax). Give specific, data-driven answers. Reference the user's actual data when relevant. Use bold for key terms, bullet points for lists. Be direct and concise (150-250 words). Note this is information, not regulated financial advice.${sections}`;

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

export async function dailySummary(facts: unknown): Promise<string> {
  const { dailySummaryPrompt } = await import('./claude');
  return (await generate(dailySummaryPrompt(facts), 400)).trim();
}
