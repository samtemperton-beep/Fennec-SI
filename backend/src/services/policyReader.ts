import Anthropic from '@anthropic-ai/sdk';
import { HAIKU } from './llm';

// Reads an insurance policy schedule (PDF or screenshot) for Finance →
// Insurance. The file is sent to Claude to read and isn't kept. Names, policy
// numbers, bank account numbers and street addresses are deliberately not
// asked for, and are dropped if they come back anyway. The person checks the
// values before saving.

export class PolicyReadError extends Error {}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 8 * 1024 * 1024;
const KINDS = ['home', 'landlord', 'contents', 'car', 'life', 'health', 'income', 'travel', 'pet', 'other'];
const FREQ = ['annual', 'quarterly', 'monthly', 'fortnightly', 'weekly'];

const PROMPT = `This should be a New Zealand insurance policy schedule, renewal notice or quote.

Reply with JSON only, no other text. Use null for anything not shown; don't guess.
{"is_policy": true or false,
 "insurer": the insurer's brand (e.g. AMI, State, Tower, AA Insurance, Youi, Initio, Vero, FMG, Cove) or null,
 "kind": one of "home", "landlord", "contents", "car", "life", "health", "income", "travel", "pet", "other" (a landlord or rental-property policy is "landlord"; ordinary home/house insurance is "home"),
 "cover_level": the product or cover level name (e.g. "Home Plus") or null,
 "suburb": the insured property's suburb or town only (never the street address), or null,
 "premium_total": total premium for the year including GST and levies, number or null,
 "base_premium": the insurer's premium before levies and GST, number or null,
 "levies": total of government levies (Natural Hazards / NHI / EQC levy plus Fire and Emergency levy), number or null,
 "gst": GST amount, number or null,
 "pay_frequency": one of "annual", "quarterly", "monthly", "fortnightly", "weekly", or null,
 "instalment": one instalment amount, number or null,
 "start_date": period start YYYY-MM-DD or null,
 "renewal_date": period end / renewal date YYYY-MM-DD or null,
 "sum_insured": the main sum insured (e.g. home sum insured), number or null,
 "excess": the standard excess, number or null,
 "other_excesses": [{"name": short name, "amount": number}],
 "settlement": basis of settlement (e.g. "Replacement", "Market value", "Indemnity") or null,
 "occupancy": exactly what the schedule says about who lives in the home (e.g. "I live in the home and also have tenants or flatmates"), or null,
 "property_type": e.g. "Townhouse, Terrace House or Duplex", or null,
 "year_built": number or null,
 "floor_area": floor area of the home including attached garage, square metres, number or null,
 "outbuildings_area": detached garage and outbuildings, square metres, number or null,
 "walls": external wall material or null,
 "roof": roof type or null,
 "storeys": number or null,
 "dwellings_in_building": number or null,
 "dwellings_insured": number or null,
 "nh_cover": Natural Hazards Cover (NHCover/EQCover) amount, number or null,
 "business_use": true, false or null,
 "optional_added": [names of optional benefits that ARE included],
 "optional_available": [names of optional benefits NOT included],
 "interested_parties": [lenders or other interested parties, e.g. "ANZ Bank NZ Ltd"],
 "cooling_off_days": number or null}

Never include anyone's name, the policy number, bank account numbers, phone numbers or the street address.`;

const num = (x: any) => {
  const n = typeof x === 'string' ? Number(x.replace(/[$,\s]/g, '')) : Number(x);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const str = (x: any, max = 80) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
const date = (x: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? String(x) : null);
// Bank account numbers (01-0298-0020257-000) and long digit runs never get stored.
const clean = (s: string | null) => (s && /\d{2}-?\d{4}-?\d{7}|\d{8,}/.test(s) ? null : s);
const list = (x: any, max = 12) => (Array.isArray(x) ? x.map(v => clean(str(v, 80))).filter(Boolean).slice(0, max) as string[] : []);

export async function readPolicy(file: { type: string; data: string }) {
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new PolicyReadError('Upload the policy schedule as a PDF, or a screenshot (JPG or PNG).');
  }
  if (Buffer.byteLength(file.data, 'base64') > MAX_BYTES) throw new PolicyReadError('That file is over 8 MB.');

  const doc: Anthropic.Messages.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as (typeof IMAGE_TYPES)[number], data: file.data } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 1500,
    messages: [{ role: 'user', content: [doc, { type: 'text', text: PROMPT }] }],
  });
  const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  let r: any;
  try { r = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch {
    throw new PolicyReadError("Couldn't read that. Try the PDF of your policy schedule.");
  }
  if (r?.is_policy === false) throw new PolicyReadError("That doesn't look like an insurance policy schedule.");
  const insurer = str(r.insurer, 60);
  if (!insurer) throw new PolicyReadError("Couldn't tell who the insurer is. Check it's the policy schedule.");

  const excesses = Array.isArray(r.other_excesses)
    ? r.other_excesses.map((e: any) => ({ name: str(e?.name, 60), amount: num(e?.amount) })).filter((e: any) => e.name && e.amount !== null).slice(0, 10)
    : [];
  return {
    insurer,
    kind: KINDS.includes(String(r.kind)) ? String(r.kind) : 'other',
    premium_total: num(r.premium_total),
    base_premium: num(r.base_premium),
    levies: num(r.levies),
    gst: num(r.gst),
    pay_frequency: FREQ.includes(String(r.pay_frequency)) ? String(r.pay_frequency) : null,
    instalment: num(r.instalment),
    start_date: date(r.start_date),
    renewal_date: date(r.renewal_date),
    sum_insured: num(r.sum_insured),
    excess: num(r.excess),
    details: {
      cover_level: str(r.cover_level, 60),
      suburb: clean(str(r.suburb, 60)),
      settlement: str(r.settlement, 40),
      occupancy: str(r.occupancy, 160),
      property_type: str(r.property_type, 80),
      year_built: num(r.year_built),
      floor_area: num(r.floor_area),
      outbuildings_area: num(r.outbuildings_area),
      walls: str(r.walls, 60),
      roof: str(r.roof, 60),
      storeys: num(r.storeys),
      dwellings_in_building: num(r.dwellings_in_building),
      dwellings_insured: num(r.dwellings_insured),
      nh_cover: num(r.nh_cover),
      business_use: typeof r.business_use === 'boolean' ? r.business_use : null,
      other_excesses: excesses,
      optional_added: list(r.optional_added),
      optional_available: list(r.optional_available),
      interested_parties: list(r.interested_parties, 5),
      cooling_off_days: num(r.cooling_off_days),
    },
  };
}
