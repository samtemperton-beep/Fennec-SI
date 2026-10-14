import crypto from 'crypto';

// Authenticated encryption for third-party tokens stored in the database
// (currently Akahu). AES-256-GCM, with the owning user's id bound in as
// additional authenticated data so a ciphertext can't be copied to another
// user's row and still decrypt.
//
// Stored format:  enc:v1:<iv>:<tag>:<ciphertext>   (all base64url)
//
// The key comes from AKAHU_TOKEN_KEY, deliberately NOT the older
// ENCRYPTION_SECRET: that value was committed to this repo's public git
// history, so anything encrypted with it would be readable by anyone.

const PREFIX = 'enc:v1:';
const KEY_CONTEXT = 'fennec-token-encryption-v1';
const MIN_KEY_LENGTH = 32;

// SHA-256 digests of secrets known to be exposed. A key matching one of these
// is refused, so the leaked ENCRYPTION_SECRET can't be pointed at this by mistake.
const EXPOSED_KEY_SHA256 = new Set<string>([
  '678799a00e5d7ebf72171d33a0264bf1de56cf4a525a3227a0d06f843bf78687', // ENCRYPTION_SECRET committed in "Initial Fennec SI commit"
]);

export class TokenKeyError extends Error {
  code = 'encryption_not_configured';
}
export class TokenDecryptError extends Error {
  code = 'credentials_unreadable';
}

let cached: { raw: string; key: Buffer } | null = null;

function getKey(): Buffer {
  const raw = process.env.AKAHU_TOKEN_KEY;
  if (!raw) throw new TokenKeyError('AKAHU_TOKEN_KEY is not set on the server.');
  if (raw.length < MIN_KEY_LENGTH) {
    throw new TokenKeyError(`AKAHU_TOKEN_KEY must be at least ${MIN_KEY_LENGTH} characters.`);
  }
  if (EXPOSED_KEY_SHA256.has(crypto.createHash('sha256').update(raw).digest('hex'))) {
    throw new TokenKeyError('AKAHU_TOKEN_KEY is set to a secret that was exposed in git. Generate a new one.');
  }
  if (cached?.raw === raw) return cached.key;
  // HKDF so the raw secret never is the cipher key itself, and the same secret
  // can't be confused with one used for another purpose.
  const key = Buffer.from(crypto.hkdfSync('sha256', raw, Buffer.alloc(0), KEY_CONTEXT, 32));
  cached = { raw, key };
  return key;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** True when a usable encryption key is configured. Never throws. */
export function encryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plain: string, userId: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64url')).join(':');
}

export function decryptToken(stored: string, userId: string): string {
  if (!isEncrypted(stored)) throw new TokenDecryptError('Value is not in the encrypted format.');
  const key = getKey();
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new TokenDecryptError('Malformed encrypted value.');
  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, wrong user, or tampered data. Deliberately uninformative.
    throw new TokenDecryptError('Could not decrypt stored credentials.');
  }
}
