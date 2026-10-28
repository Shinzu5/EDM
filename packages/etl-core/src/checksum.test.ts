import { describe, expect, it } from 'vitest';
import { canonicalJson, checksumOf, deterministicUuid, sha256Hex } from './checksum.js';

describe('checksum', () => {
  it('canonicalJson is key-order independent', () => {
    const a = { z: 1, a: { y: 2, b: [3, { d: 4, c: 5 }] } };
    const b = { a: { b: [3, { c: 5, d: 4 }], y: 2 }, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(checksumOf(a)).toBe(checksumOf(b));
  });

  it('checksumOf is idempotent for the same payload and differs for changed payloads', () => {
    const payload = { mrn: 'MRN-1', dob: '1985-03-14', sex: 'MALE' };
    const first = checksumOf(payload);
    expect(checksumOf({ ...payload })).toBe(first);
    expect(checksumOf({ ...payload, sex: 'FEMALE' })).not.toBe(first);
  });

  it('sha256Hex produces the known sha256 of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('deterministicUuid is stable and uuid-shaped', () => {
    const id1 = deterministicUuid('fact-claim', 'CLM-2024-900000');
    const id2 = deterministicUuid('fact-claim', 'CLM-2024-900000');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(deterministicUuid('fact-claim', 'CLM-2')).not.toBe(id1);
  });
});
