/**
 * AES-256-GCM field-level encryption for `Patient.ssnEncrypted`.
 *
 * The key is derived from JWT_SECRET via scrypt (fixed salt — a single
 * platform key, never stored). Ciphertext format: `iv:authTag:ciphertext`,
 * all base64. Tampering with any part fails GCM auth-tag verification.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce size
const KEY_SALT = 'medidata-ssn-field-encryption-v1';

let cachedKey: Buffer | null = null;

/** Derive the 256-bit field-encryption key (lazy so tests can set env first). */
export function deriveKey(secret: string = config.JWT_SECRET): Buffer {
  if (!cachedKey || secret !== config.JWT_SECRET) {
    cachedKey = scryptSync(secret, KEY_SALT, 32);
  }
  return cachedKey;
}

/** Encrypt a plaintext field value → `iv:tag:ciphertext` (base64 parts). */
export function encryptField(plaintext: string, secret?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decrypt an `iv:tag:ciphertext` payload. Throws on tampering/format errors. */
export function decryptField(payload: string, secret?: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted field payload must be iv:tag:ciphertext');
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Never throws — returns null for missing/undecryptable values. */
export function decryptFieldSafe(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptField(payload);
  } catch {
    return null;
  }
}
