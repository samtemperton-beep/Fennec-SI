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

export async function analyzeStock(ticker: string, data: any) {
  const text = await generate(
    `You are a stock analyst. Analyze ${ticker} with this data: ${JSON.stringify(data)}.
Return JSON only: { "signal": "BUY"|"HOLD"|"SELL", "confidence": 1-10, "reason": "2 sentences", "upside_pct": number, "risks": ["string","string"] }`,
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

export async function* streamHelper(messages: any[]) {
  const client = getClient();
  const system = `You are Fennec, a friendly stock market educator built into the Fennec SI investment platform. Explain financial terms and investing concepts in plain English. Keep answers concise — short definition then a real-world example. Cover topics like P/E ratios, EPS, market cap, dividends, ETFs, indices, options, technical indicators. Be encouraging — many users are beginners. For complex topics, break into 2-3 short paragraphs max. Never give personalised buy/sell recommendations.`;

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
