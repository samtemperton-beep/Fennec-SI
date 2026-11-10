import Anthropic from '@anthropic-ai/sdk';
import { HAIKU } from './llm';

// Reads a KiwiSaver balance from a screenshot of the provider's app or website,
// or a statement PDF. For providers Akahu can't connect to (for example when
// the provider's two-factor sign-in can't be turned off). The file is sent to
// Claude to read and isn't kept; the person checks the values before saving.

export interface KiwiSaverStatementValues {
  provider: string | null;
  fund_name: string | null;
  /** conservative | balanced | growth | aggressive, as the page's fund types. */
  fund_type: string | null;
  balance: number | null;
  /** The date the balance is at (YYYY-MM-DD), if shown. */
  as_at: string | null;
  employee_rate: number | null;
}

export class KiwiSaverStatementError extends Error {}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 6 * 1024 * 1024;

const PROMPT = `This should be a screenshot of a New Zealand KiwiSaver provider's app or website, or a KiwiSaver statement.

Reply with JSON only, no other text:
{"is_kiwisaver": true or false,
 "provider": the KiwiSaver provider (for example Generate, Simplicity, Milford, Fisher Funds, ANZ, ASB, BNZ, Westpac, Booster, Kernel, SuperLife) or null,
 "fund_name": the fund's name as shown or null,
 "fund_type": one of "conservative", "balanced", "growth", "aggressive", or null,
 "balance": the current total account balance in dollars as a number, or null,
 "as_at": the date the balance is at as YYYY-MM-DD, or null,
 "employee_rate": the member's own contribution rate as a percent number (like 3.5), or null}

Rules: the balance is the whole account's current value, not a single contribution or a return figure. For fund_type, map names like "Focused Growth" or "High Growth" to "aggressive", "Moderate" or "Defensive" to "conservative", and a mix of funds to the one holding the most. Don't guess: use null for anything not shown.`;

const FUNDS = ['conservative', 'balanced', 'growth', 'aggressive'];
const num = (x: any) => {
  const n = typeof x === 'string' ? Number(x.replace(/[$,\s]/g, '')) : Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const str = (x: any, max = 80) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);

export async function readKiwiSaverStatement(file: { type: string; data: string }): Promise<KiwiSaverStatementValues> {
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new KiwiSaverStatementError('Upload a screenshot (JPG or PNG) or a PDF statement.');
  }
  if (Buffer.byteLength(file.data, 'base64') > MAX_BYTES) throw new KiwiSaverStatementError('That file is over 6 MB. Try a smaller screenshot.');

  const doc: Anthropic.Messages.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as (typeof IMAGE_TYPES)[number], data: file.data } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 300,
    messages: [{ role: 'user', content: [doc, { type: 'text', text: PROMPT }] }],
  });
  const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  let r: any;
  try { r = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch {
    throw new KiwiSaverStatementError("Couldn't read that. Try a clearer screenshot that shows your balance.");
  }
  if (r?.is_kiwisaver === false) throw new KiwiSaverStatementError("That doesn't look like a KiwiSaver screen or statement.");

  const rate = num(r.employee_rate);
  const values: KiwiSaverStatementValues = {
    provider: str(r.provider, 40),
    fund_name: str(r.fund_name),
    fund_type: FUNDS.includes(String(r.fund_type)) ? String(r.fund_type) : null,
    balance: num(r.balance),
    as_at: /^\d{4}-\d{2}-\d{2}$/.test(String(r.as_at)) ? String(r.as_at) : null,
    employee_rate: rate && rate <= 20 ? rate : null,
  };
  if (!values.balance) throw new KiwiSaverStatementError("Couldn't find your balance on that. Use the screen that shows your total KiwiSaver balance.");
  return values;
}
