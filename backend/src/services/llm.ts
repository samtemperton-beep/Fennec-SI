import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

// One way to call any model. Every AI feature names its model, and this sends it
// to Claude or Gemini, so the admin page can move any feature between them,
// separately for free and premium users.

export const HAIKU = 'claude-haiku-4-5-20251001';
export const SONNET = 'claude-sonnet-4-6';
export const GEMINI_FLASH = 'gemini-2.5-flash';
export const MODELS = [GEMINI_FLASH, HAIKU, SONNET];

export type Feature =
  | 'analyze' | 'helper' | 'top10' | 'opportunities' | 'summary' | 'inbox'
  | 'setup_help' | 'news' | 'ipo' | 'deep_dive' | 'draft_post';

// Used until a choice is saved on the admin page. Deep dive and post drafting
// are premium only, so their free entries are never used.
const DEFAULTS: Record<Feature, { premium: string; free: string }> = {
  analyze:       { premium: HAIKU,        free: GEMINI_FLASH },
  helper:        { premium: SONNET,       free: GEMINI_FLASH },
  top10:         { premium: HAIKU,        free: HAIKU },
  opportunities: { premium: HAIKU,        free: HAIKU },
  summary:       { premium: GEMINI_FLASH, free: GEMINI_FLASH },
  inbox:         { premium: HAIKU,        free: HAIKU },
  setup_help:    { premium: HAIKU,        free: HAIKU },
  news:          { premium: GEMINI_FLASH, free: GEMINI_FLASH },
  ipo:           { premium: GEMINI_FLASH, free: GEMINI_FLASH },
  deep_dive:     { premium: HAIKU,        free: HAIKU },
  draft_post:    { premium: HAIKU,        free: HAIKU },
};

/** Premium choices are saved as model_<feature>, free ones as model_free_<feature>. */
export function settingKey(feature: Feature, isPremium: boolean) {
  return isPremium ? `model_${feature}` : `model_free_${feature}`;
}

export function modelFor(settings: Record<string, string>, feature: Feature, isPremium: boolean): string {
  const saved = settings[settingKey(feature, isPremium)];
  return saved && MODELS.includes(saved) ? saved : DEFAULTS[feature][isPremium ? 'premium' : 'free'];
}

export const isGemini = (model: string) => model.startsWith('gemini-');

export type Message = { role: 'user' | 'assistant'; content: string };

export interface CompletionRequest {
  model: string;
  system?: string;
  messages: Message[];
  maxTokens: number;
  /** A user's own Anthropic key. Only used for Claude models. */
  apiKey?: string;
}

/** Chat history from the browser, reduced to plain user and assistant turns. */
export function cleanMessages(messages: any[]): Message[] {
  return (Array.isArray(messages) ? messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content }));
}

function claudeClient(apiKey?: string) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
}

function geminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey: key });
}

function geminiRequest(r: CompletionRequest) {
  return {
    model: r.model,
    contents: r.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    // No thinking: these are short answers, and thinking tokens count against
    // maxOutputTokens, which can leave nothing for the answer itself.
    config: { systemInstruction: r.system, maxOutputTokens: r.maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
}

// Gemini sometimes answers busy (503) or rate limited (429); a short wait usually clears it.
async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (attempt < 2 && (e?.status === 503 || e?.status === 429)) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      return withRetry(fn, attempt + 1);
    }
    throw e;
  }
}

export async function complete(r: CompletionRequest): Promise<string> {
  if (isGemini(r.model)) {
    const res = await withRetry(() => geminiClient().models.generateContent(geminiRequest(r)));
    return res.text ?? '';
  }
  const msg = await claudeClient(r.apiKey).messages.create({
    model: r.model,
    max_tokens: r.maxTokens,
    ...(r.system ? { system: r.system } : {}),
    messages: r.messages,
  });
  return msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
}

export async function* stream(r: CompletionRequest): AsyncGenerator<string> {
  if (isGemini(r.model)) {
    const res = await withRetry(() => geminiClient().models.generateContentStream(geminiRequest(r)));
    for await (const chunk of res) {
      if (chunk.text) yield chunk.text;
    }
    return;
  }
  const s = claudeClient(r.apiKey).messages.stream({
    model: r.model,
    max_tokens: r.maxTokens,
    ...(r.system ? { system: r.system } : {}),
    messages: r.messages,
  });
  for await (const event of s) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
