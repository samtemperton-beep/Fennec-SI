import Anthropic from '@anthropic-ai/sdk';
import { SONNET } from './llm';

// Reads a property manager's monthly owner statement (PDF or screenshot) for
// Finance → Rental. The file is sent to Claude to read and isn't kept.
// Tenant names, bank account numbers and addresses aren't asked for, and are
// dropped if they come back anyway. The person checks the figures before
// saving, and the totals are compared with the statement's own.

export class StatementReadError extends Error {}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 8 * 1024 * 1024;
const LINES = ['Rates', 'Insurance', 'Repairs and maintenance', 'Other expenses', 'Improvements', 'Tenant utilities'];
const FEE_TYPES = ['letting', 'inspection', 'advertising', 'admin', 'other'];

const PROMPT = `This should be a New Zealand property manager's statement to a rental property owner (an "owner statement" or "statement of account").

Reply with JSON only, no other text. Use null for anything not shown; don't guess. Dates as YYYY-MM-DD (NZ dates are day/month/year). All amounts are positive numbers in dollars.
{"is_statement": true or false,
 "agent": the property management company's name, or null,
 "period_start": first day the statement covers, or null,
 "period_end": the "as at" date or last day it covers,
 "rent": [{"date": date received, "amount": rent amount before fees, "fee": the fee taken on it INCLUDING its GST (e.g. fee 57.60 + GST 8.64 = 66.24)}],
 "receipts": [{"date": date, "amount": number, "kind": "utilities" for power, broadband, internet, gas or water rates the tenant paid back; "bond" for bond money; "other" for anything else, "label": short description without names}],
 "expenses": [{"date": date, "amount": the bill's amount, "fee": any fee the agent charged on paying it INCLUDING its GST, or 0, "label": what it was for and who did it (no tenant names), "line": one of "Rates", "Insurance", "Repairs and maintenance", "Improvements", "Tenant utilities", "Other expenses"}],
 "fees": [{"date": date, "amount": the fee INCLUDING its GST, "type": one of "letting" (letting, leasing or new tenancy fee), "inspection", "advertising", "admin", "other", "label": short description}],
 "payments": [{"date": date, "amount": amount paid to the owner}],
 "totals": {"income": statement's total income or null, "fees": total of all fees AND their GST (fees on income + other fees + GST) or null, "expenses": total expenses or null, "payments": total paid to owner or null}}

Notes:
- Fees on rent go in "rent"."fee", not in "fees". Fees on a bill the agent paid go in that expense's "fee". Letting, inspection and other standalone fees go in "fees".
- A row that only holds money back for a charge that isn't taken yet (a "keep back" or "pending charge") is not a fee; leave it out.
- Never include anyone's name, bank account numbers, phone numbers or street addresses.`;

const num = (x: any) => {
  const n = typeof x === 'string' ? Number(x.replace(/[$,\s]/g, '')) : Number(x);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : null;
};
const date = (x: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) && !Number.isNaN(Date.parse(String(x))) ? String(x) : null);
// Bank account numbers and long digit runs never get stored.
const clean = (s: any, max = 80) => {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = s.trim().replace(/\d{2}-?\d{4}-?\d{7}-?\d{2,3}/g, '').replace(/\d{8,}/g, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const arr = (x: any) => (Array.isArray(x) ? x.slice(0, 60) : []);
const round = (n: number) => Math.round(n * 100) / 100;

export interface StatementItem {
  date: string; kind: 'rent' | 'utilities' | 'other_income' | 'fee' | 'expense' | 'payment';
  label: string; amount: number; fee?: number; fee_type?: string; line?: string;
}

export async function readAgentStatement(file: { type: string; data: string }) {
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new StatementReadError('Upload the statement as a PDF, or a screenshot (JPG or PNG).');
  }
  if (Buffer.byteLength(file.data, 'base64') > MAX_BYTES) throw new StatementReadError('That file is over 8 MB.');

  const doc: Anthropic.Messages.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as (typeof IMAGE_TYPES)[number], data: file.data } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 4000,
    messages: [{ role: 'user', content: [doc, { type: 'text', text: PROMPT }] }],
  });
  const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  let r: any;
  try { r = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch {
    throw new StatementReadError("Couldn't read that. Try the PDF of the statement.");
  }
  if (r?.is_statement === false) throw new StatementReadError("That doesn't look like a property manager's statement.");
  const periodEnd = date(r.period_end);
  if (!periodEnd) throw new StatementReadError("Couldn't find the statement date. Check it's the monthly statement.");

  const items: StatementItem[] = [];
  for (const x of arr(r.rent)) {
    const d = date(x?.date), a = num(x?.amount);
    if (d && a) items.push({ date: d, kind: 'rent', label: 'Rent', amount: a, fee: num(x?.fee) ?? 0 });
  }
  for (const x of arr(r.receipts)) {
    const d = date(x?.date), a = num(x?.amount);
    if (!d || !a || x?.kind === 'bond') continue; // Bond is the tenant's money, held by Tenancy Services.
    const utilities = x?.kind === 'utilities';
    items.push({ date: d, kind: utilities ? 'utilities' : 'other_income', label: clean(x?.label) ?? (utilities ? 'Utilities paid back' : 'Other income'), amount: a });
  }
  for (const x of arr(r.expenses)) {
    const d = date(x?.date), a = num(x?.amount);
    if (d && a) items.push({ date: d, kind: 'expense', label: clean(x?.label) ?? 'Bill paid by the agent', amount: a, fee: num(x?.fee) ?? 0, line: LINES.includes(x?.line) ? x.line : 'Other expenses' });
  }
  for (const x of arr(r.fees)) {
    const d = date(x?.date), a = num(x?.amount);
    if (d && a) items.push({ date: d, kind: 'fee', label: clean(x?.label) ?? 'Fee', amount: a, fee_type: FEE_TYPES.includes(x?.type) ? x.type : 'other' });
  }
  for (const x of arr(r.payments)) {
    const d = date(x?.date), a = num(x?.amount);
    if (d && a) items.push({ date: d, kind: 'payment', label: 'Paid to you', amount: a });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  const sum = (k: StatementItem['kind'], f: (i: StatementItem) => number = i => i.amount) => round(items.filter(i => i.kind === k).reduce((s, i) => s + f(i), 0));
  const fees = round(sum('rent', i => i.fee ?? 0) + sum('expense', i => i.fee ?? 0) + sum('fee'));
  const out = {
    agent: clean(r.agent, 80),
    period_start: date(r.period_start),
    period_end: periodEnd,
    rent: sum('rent'),
    fees,
    expenses: sum('expense'),
    utilities: sum('utilities'),
    other_income: sum('other_income'),
    paid_to_owner: sum('payment'),
    items,
    // Where Fennec's sums differ from the statement's own totals by over $1.
    mismatches: [] as string[],
  };
  const t = r.totals ?? {};
  const check = (label: string, ours: number, theirs: number | null) => {
    if (theirs !== null && Math.abs(ours - theirs) > 1) out.mismatches.push(`${label}: read ${ours.toFixed(2)}, statement says ${theirs.toFixed(2)}`);
  };
  check('Income', round(out.rent + out.utilities + out.other_income), num(t.income));
  check('Fees incl. GST', fees, num(t.fees));
  check('Paid to you', out.paid_to_owner, num(t.payments));
  return out;
}
