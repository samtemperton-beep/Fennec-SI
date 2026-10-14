// One-off backfill: encrypts Akahu tokens that were saved before encryption existed.
//
//   npx ts-node src/scripts/encryptAkahuTokens.ts           # dry run (default)
//   npx ts-node src/scripts/encryptAkahuTokens.ts --apply   # write changes
//
// IMPORTANT: run this with the SAME AKAHU_TOKEN_KEY the deployed backend uses.
// Rows encrypted with a different key can't be decrypted by the server, and
// the user would have to re-enter their tokens. If you're unsure, skip this
// script: rows are also upgraded automatically the next time each user syncs.
//
// It prints counts only, never token values.
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { decryptToken, encryptToken, encryptionAvailable, isEncrypted } from '../services/tokenCrypto';

dotenv.config();

async function main() {
  const apply = process.argv.includes('--apply');

  if (!encryptionAvailable()) {
    console.error('AKAHU_TOKEN_KEY is missing, too short, or a known-exposed secret. Nothing was changed.');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    realtime: { transport: ws as any },
  });

  const { data, error } = await supabase.from('akahu_credentials').select('user_id, app_token, user_token');
  if (error) {
    console.error('Could not read akahu_credentials:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  let alreadyEncrypted = 0;
  let toEncrypt = 0;
  let encrypted = 0;
  let failed = 0;

  for (const row of rows) {
    if (isEncrypted(row.app_token) && isEncrypted(row.user_token)) {
      alreadyEncrypted++;
      continue;
    }
    toEncrypt++;
    if (!apply) continue;

    const next = {
      app_token: isEncrypted(row.app_token) ? row.app_token : encryptToken(row.app_token, row.user_id),
      user_token: isEncrypted(row.user_token) ? row.user_token : encryptToken(row.user_token, row.user_id),
    };
    const { error: updateError } = await supabase.from('akahu_credentials').update(next).eq('user_id', row.user_id);
    if (updateError) {
      failed++;
      continue;
    }

    // Verify the stored value really decrypts back to the original.
    const { data: check } = await supabase
      .from('akahu_credentials')
      .select('app_token, user_token')
      .eq('user_id', row.user_id)
      .maybeSingle();
    const original = isEncrypted(row.app_token) ? decryptToken(row.app_token, row.user_id) : row.app_token;
    const originalUser = isEncrypted(row.user_token) ? decryptToken(row.user_token, row.user_id) : row.user_token;
    const ok =
      !!check &&
      decryptToken(check.app_token, row.user_id) === original &&
      decryptToken(check.user_token, row.user_id) === originalUser;
    if (ok) encrypted++;
    else failed++;
  }

  console.log(`rows: ${rows.length}`);
  console.log(`already encrypted: ${alreadyEncrypted}`);
  console.log(`plaintext rows: ${toEncrypt}`);
  if (apply) {
    console.log(`encrypted + verified: ${encrypted}`);
    console.log(`failed: ${failed}`);
    process.exit(failed ? 1 : 0);
  } else {
    console.log('Dry run: nothing was changed. Re-run with --apply to encrypt.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
