import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveKey, TokenDecryptError } from './tokenCrypto';

// Personal identifiers stored encrypted, so a copy of the database alone shows
// only ciphertext for them. The key lives on the server (derived from
// AKAHU_TOKEN_KEY), never in Supabase, and each value is bound to its owner and
// field, so it can't be copied to another row or column and still decrypt.
//
// The browser never reads these columns directly: it asks /api/private for a
// hint ("••• 789") and, when the person taps the eye, for the value itself.
// private_fields_migration.sql makes the database refuse anything else.
//
// Stored format:  enc:f1:<iv>:<tag>:<ciphertext>   (all base64url)

const PREFIX = 'enc:f1:';
const KEY_CONTEXT = 'fennec-field-encryption-v1';

export const PRIVATE_FIELDS = {
  ird_number:   { table: 'business_settings', column: 'ird_number',   kind: 'number',  max: 20 },
  gst_number:   { table: 'business_settings', column: 'gst_number',   kind: 'number',  max: 20 },
  bank_account: { table: 'business_settings', column: 'bank_account', kind: 'number',  max: 30 },
  home_address: { table: 'home_loan',         column: 'address',      kind: 'address', max: 200 },
} as const;

export type PrivateField = keyof typeof PRIVATE_FIELDS;
export const isPrivateField = (f: unknown): f is PrivateField =>
  typeof f === 'string' && Object.prototype.hasOwnProperty.call(PRIVATE_FIELDS, f);

export class PrivateFieldError extends Error {}

export const isFieldEncrypted = (v: string) => v.startsWith(PREFIX);

// Also used for the saved property details (services/propertyStore.ts), which aren't a field the page edits.
export type SealedField = PrivateField | 'property_details';

const aad = (userId: string, field: SealedField) => Buffer.from(`${userId}:${field}`, 'utf8');

export function encryptField(plain: string, userId: string, field: SealedField): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(KEY_CONTEXT), iv);
  cipher.setAAD(aad(userId, field));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ct].map(b => b.toString('base64url')).join(':');
}

export function decryptField(stored: string, userId: string, field: SealedField): string {
  const parts = stored.slice(PREFIX.length).split(':');
  if (!isFieldEncrypted(stored) || parts.length !== 3) throw new TokenDecryptError('Malformed encrypted value.');
  try {
    const [iv, tag, ct] = parts.map(p => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(KEY_CONTEXT), iv);
    decipher.setAAD(aad(userId, field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenDecryptError('Could not decrypt a saved detail.');
  }
}

/** Enough to recognise a value without revealing it: "••• 789", or the suburb of an address. */
export function hintFor(field: PrivateField, plain: string): string {
  if (PRIVATE_FIELDS[field].kind === 'address') {
    const parts = plain.split(',').map(p => p.trim()).filter(Boolean);
    return parts.length > 1 ? `•••••, ${parts.slice(1).join(', ')}` : '••••••••';
  }
  const digits = plain.replace(/\D/g, '');
  return digits.length > 4 ? `••• ${digits.slice(-3)}` : '•••';
}

function clean(field: PrivateField, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new PrivateFieldError('Each detail must be text.');
  const v = value.trim().replace(/\s+/g, ' ');
  const spec = PRIVATE_FIELDS[field];
  if (v.length > spec.max) throw new PrivateFieldError(`That's too long for a ${field.replace('_', ' ')}.`);
  if (spec.kind === 'number' && v && !/^[0-9][0-9 \-]*$/.test(v)) {
    throw new PrivateFieldError(`Use only numbers, spaces and dashes for the ${field.replace('_', ' ')}.`);
  }
  return v;
}

const TABLES = [...new Set(Object.values(PRIVATE_FIELDS).map(f => f.table))];
const fieldsOf = (table: string) => (Object.keys(PRIVATE_FIELDS) as PrivateField[]).filter(f => PRIVATE_FIELDS[f].table === table);

/**
 * The person's private details in plain text (null where not saved). Values
 * still in plain text from before encryption are returned and encrypted in place.
 */
export async function loadPrivateFields(supabase: SupabaseClient, userId: string, only?: PrivateField[]) {
  const out = {} as Record<PrivateField, string | null>;
  for (const table of TABLES) {
    const fields = fieldsOf(table).filter(f => !only || only.includes(f));
    if (!fields.length) continue;
    const cols = fields.map(f => PRIVATE_FIELDS[f].column);
    const { data, error } = await supabase.from(table).select(cols.join(', ')).eq('user_id', userId).maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    const legacy: Record<string, string> = {};
    for (const f of fields) {
      const stored = (data as any)?.[PRIVATE_FIELDS[f].column] as string | null | undefined;
      if (!stored) { out[f] = null; continue; }
      if (isFieldEncrypted(stored)) { out[f] = decryptField(stored, userId, f); continue; }
      out[f] = stored;
      legacy[PRIVATE_FIELDS[f].column] = encryptField(stored, userId, f);
    }
    if (Object.keys(legacy).length) await supabase.from(table).update(legacy).eq('user_id', userId);
  }
  return out;
}

/** Saves the given details, encrypted. The row must already exist (the page saves it first). */
export async function savePrivateFields(supabase: SupabaseClient, userId: string, updates: Record<string, unknown>) {
  const keys = Object.keys(updates);
  if (!keys.length) return;
  const bad = keys.find(k => !isPrivateField(k));
  if (bad) throw new PrivateFieldError(`Unknown detail: ${bad}`);
  for (const table of TABLES) {
    const row: Record<string, string | null> = {};
    for (const f of fieldsOf(table)) {
      if (!(f in updates)) continue;
      const v = clean(f, updates[f]);
      row[PRIVATE_FIELDS[f].column] = v ? encryptField(v, userId, f) : null;
    }
    if (!Object.keys(row).length) continue;
    const { data, error } = await supabase.from(table).update(row).eq('user_id', userId).select('user_id');
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) throw new PrivateFieldError('Save the rest of the details first, then try again.');
  }
}

/** Encrypts any values saved in plain text before this existed. Safe to run repeatedly. */
export async function encryptLegacyFields(supabase: SupabaseClient): Promise<number> {
  let changed = 0;
  for (const table of TABLES) {
    const fields = fieldsOf(table);
    const cols = fields.map(f => PRIVATE_FIELDS[f].column);
    const { data, error } = await supabase.from(table).select(['user_id', ...cols].join(', '));
    if (error) { console.warn(`[private fields] ${table}:`, error.message); continue; }
    for (const r of (data ?? []) as any[]) {
      const row: Record<string, string> = {};
      for (const f of fields) {
        const v = r[PRIVATE_FIELDS[f].column];
        if (typeof v === 'string' && v && !isFieldEncrypted(v)) row[PRIVATE_FIELDS[f].column] = encryptField(v, r.user_id, f);
      }
      if (!Object.keys(row).length) continue;
      const { error: upErr } = await supabase.from(table).update(row).eq('user_id', r.user_id);
      if (upErr) console.warn(`[private fields] ${table} ${r.user_id}:`, upErr.message);
      else changed++;
    }
  }
  return changed;
}
