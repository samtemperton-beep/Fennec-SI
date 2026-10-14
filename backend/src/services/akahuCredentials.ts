import type { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  decryptToken,
  encryptToken,
  encryptionAvailable,
  isEncrypted,
  TokenDecryptError,
  TokenKeyError,
} from './tokenCrypto';

// The only code that should touch the token columns of akahu_credentials.
// Tokens are encrypted before they're written and decrypted only on the server.

export class CredentialsValidationError extends Error {}

/** Maps credential errors to an HTTP response without leaking internals. */
export function credentialsErrorResponse(res: Response, e: unknown) {
  if (e instanceof CredentialsValidationError) {
    return res.status(400).json({ error: e.message });
  }
  if (e instanceof TokenKeyError) {
    // Log the specific reason for the operator; tell the user something actionable.
    console.error('[akahu credentials] encryption key problem:', e.message);
    return res.status(500).json({
      error: "Secure storage for Akahu tokens isn't configured on the server yet, so they can't be saved or read.",
      code: e.code,
    });
  }
  if (e instanceof TokenDecryptError) {
    return res.status(409).json({
      error: "Your saved Akahu tokens couldn't be read. Please re-enter them in Settings → Akahu.",
      code: e.code,
    });
  }
  console.error('[akahu credentials] unexpected error:', e instanceof Error ? e.message : e);
  return res.status(500).json({ error: 'Could not access Akahu credentials.' });
}

export interface AkahuCredentials {
  appToken: string;
  userToken: string;
  lastSyncedAt: string | null;
}

export async function saveAkahuCredentials(
  supabase: SupabaseClient,
  userId: string,
  appToken: string,
  userToken: string
): Promise<void> {
  const app = appToken.trim();
  const user = userToken.trim();
  if (!app || !user) throw new CredentialsValidationError('Both Akahu tokens are required.');
  if (app.length > 500 || user.length > 500 || /\s/.test(app) || /\s/.test(user)) {
    throw new CredentialsValidationError("That doesn't look like an Akahu token.");
  }

  // Throws TokenKeyError if no usable key; never falls back to plaintext.
  const row = {
    user_id: userId,
    app_token: encryptToken(app, userId),
    user_token: encryptToken(user, userId),
  };
  const { error } = await supabase.from('akahu_credentials').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/**
 * Returns the user's decrypted Akahu tokens, or null if none are saved.
 *
 * Rows saved before encryption existed are still plaintext. They're accepted
 * (so existing users keep working) and re-encrypted in place the first time
 * they're read, provided an encryption key is configured.
 */
export async function loadAkahuCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<AkahuCredentials | null> {
  const { data, error } = await supabase
    .from('akahu_credentials')
    .select('app_token, user_token, last_synced_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const legacy = !isEncrypted(data.app_token) || !isEncrypted(data.user_token);
  const appToken = isEncrypted(data.app_token) ? decryptToken(data.app_token, userId) : data.app_token;
  const userToken = isEncrypted(data.user_token) ? decryptToken(data.user_token, userId) : data.user_token;

  if (legacy && encryptionAvailable()) {
    const { error: upgradeError } = await supabase
      .from('akahu_credentials')
      .update({ app_token: encryptToken(appToken, userId), user_token: encryptToken(userToken, userId) })
      .eq('user_id', userId);
    if (upgradeError) console.error('[akahu credentials] could not re-encrypt legacy row:', upgradeError.message);
  }

  return { appToken, userToken, lastSyncedAt: data.last_synced_at ?? null };
}
