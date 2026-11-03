import Anthropic from '@anthropic-ai/sdk';
import { HAIKU } from './llm';

// Reads the council valuation from a rates notice or revaluation letter, for
// people whose council isn't in LINZ's open valuation roll (see services/linz.ts).
// The document is sent to Claude to read and isn't kept.

export interface RatesNoticeValues {
  council: string | null;
  address: string | null;
  valuation_reference: string | null;
  capital_value: number | null;
  land_value: number | null;
  improvements_value: number | null;
  /** The date the valuation applies from (YYYY-MM-DD). */
  valuation_date: string | null;
  /** Total rates for the year, if the document shows them. */
  annual_rates: number | null;
}

export class RatesNoticeError extends Error {}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_BYTES = 6 * 1024 * 1024;

const PROMPT = `This should be a New Zealand council rates notice, rates invoice, or rating revaluation notice.

Reply with JSON only, no other text:
{"is_rates_document": true or false,
 "council": the council's name or null,
 "address": the property address or null,
 "valuation_reference": the valuation or assessment number or null,
 "capital_value": the current capital value (CV) in dollars as a number or null,
 "land_value": the land value in dollars as a number or null,
 "improvements_value": the improvements value in dollars as a number or null,
 "valuation_date": the date the valuation applies from as YYYY-MM-DD, or null,
 "annual_rates": total rates for the year in dollars as a number, or null}

Rules: use the current valuation, not a previous one. If a notice shows both old and new values, use the new one. Don't guess: use null for anything not printed on the document.`;

const num = (x: any) => {
  const n = typeof x === 'string' ? Number(x.replace(/[$,\s]/g, '')) : Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const str = (x: any, max = 200) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);

export async function readRatesNotice(file: { type: string; data: string }): Promise<RatesNoticeValues> {
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new RatesNoticeError('Upload a PDF or a photo (JPG, PNG) of your rates notice.');
  }
  if (Buffer.byteLength(file.data, 'base64') > MAX_BYTES) throw new RatesNoticeError('That file is over 6 MB. Try a smaller photo or a PDF.');

  const doc: Anthropic.Messages.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as (typeof IMAGE_TYPES)[number], data: file.data } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 400,
    messages: [{ role: 'user', content: [doc, { type: 'text', text: PROMPT }] }],
  });
  const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  let r: any;
  try { r = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch {
    throw new RatesNoticeError("Couldn't read that document. Try a clearer photo or the PDF from your council.");
  }
  if (r?.is_rates_document === false) throw new RatesNoticeError("That doesn't look like a rates notice or revaluation letter.");

  const values: RatesNoticeValues = {
    council: str(r.council),
    address: str(r.address),
    valuation_reference: str(r.valuation_reference, 60),
    capital_value: num(r.capital_value),
    land_value: num(r.land_value),
    improvements_value: num(r.improvements_value),
    valuation_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.valuation_date)) ? String(r.valuation_date) : null,
    annual_rates: num(r.annual_rates),
  };
  if (!values.capital_value) throw new RatesNoticeError("Couldn't find a capital value (CV) on that document. Check it's the page that shows the valuation.");
  return values;
}
