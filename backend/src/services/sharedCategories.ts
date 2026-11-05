// The shared category list (shared_categories_migration.sql): merchant keyword ->
// default category name, approved by an admin before anyone's transactions use it.

export const DEFAULT_CATEGORIES: Record<'household' | 'business', string[]> = {
  household: ['Groceries', 'Rent/Mortgage', 'Utilities', 'Transport', 'Dining Out', 'Entertainment',
    'Subscriptions', 'Health & Wellness', 'Shopping', 'Insurance', 'Savings', 'Income', 'Miscellaneous'],
  business: ['Sales', 'Materials', 'Subcontractors', 'Vehicle', 'Tools & Equipment', 'Software', 'Office',
    'Insurance', 'Accounting', 'Tax', 'Drawings', 'Miscellaneous'],
};

export type Scope = keyof typeof DEFAULT_CATEGORIES;

/** A keyword as the database stores it, or null if it can't be used. */
export function cleanKeyword(raw: unknown): string | null {
  const k = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (k.length < 3 || k.length > 40 || /[%_\\]/.test(k) || !/[a-z]/.test(k) || /\d{5,}/.test(k)) return null;
  return k;
}

export const isDefaultCategory = (name: string, scope: string) =>
  (scope === 'household' || scope === 'business') && DEFAULT_CATEGORIES[scope].includes(name);

/**
 * A likely merchant keyword from a bank description: the merchant's first word,
 * or more while the words are short ("Z ENERGY", "PAK N SAVE"). It's always an
 * exact piece of the description, because matching is a plain "contains".
 *   "WOOLWORTHS NZ/1234 TAURANGA" -> "woolworths"
 *   "POS W/D PAK N SAVE BAYFAIR"  -> "pak n save"
 */
export function merchantKey(description: string): string | null {
  const text = description.toLowerCase().replace(/\s+/g, ' ').trim();
  const rest = text.replace(/^((pos|eftpos|visa|debit|card|purchase|w\/d|dd|ap|tfr|ft)\s+)+/, '');
  const name = rest.match(/^[a-z][a-z&'.-]*(?: [a-z&'.-]+)*/)?.[0] ?? '';
  const words = name.split(' ');
  const picked: string[] = [];
  for (const w of words) {
    picked.push(w);
    const next = words[picked.length];
    // Stop once the first word is long enough, unless a single letter follows (as in "pak n save").
    if (picked.join('').length >= 3 && w.length >= 3 && !(next && next.length === 1)) break;
  }
  const key = cleanKeyword(picked.join(' '));
  return key && text.includes(key) ? key : null;
}
