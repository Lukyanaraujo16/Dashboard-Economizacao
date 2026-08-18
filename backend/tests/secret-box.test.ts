import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  parseIntegrationEncryptionKey,
  SecretBoxError,
} from '../src/infrastructure/crypto/secret-box.js';

const KEY = parseIntegrationEncryptionKey('ab'.repeat(32));

describe('secret-box AES-256-GCM', () => {
  it('cifra e decifra', () => {
    const secret = 'refresh-token-value';
    const encrypted = encryptSecret(secret, KEY);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, KEY)).toBe(secret);
  });

  it('usa nonce único por operação', () => {
    const first = encryptSecret('same-secret', KEY);
    const second = encryptSecret('same-secret', KEY);
    expect(first).not.toBe(second);
    expect(decryptSecret(first, KEY)).toBe('same-secret');
    expect(decryptSecret(second, KEY)).toBe('same-secret');
  });

  it('detecta adulteração', () => {
    const encrypted = encryptSecret('token', KEY);
    const tampered = `${encrypted.slice(0, -2)}aa`;
    expect(() => decryptSecret(tampered, KEY)).toThrow(SecretBoxError);
  });

  it('rejeita chave inválida', () => {
    expect(() => parseIntegrationEncryptionKey('short')).toThrow(/64 caracteres/);
    expect(() => encryptSecret('token', Buffer.from('nope'))).toThrow(SecretBoxError);
  });

  it('não é Base64 do plaintext', () => {
    const secret = 'plain-token';
    const encrypted = encryptSecret(secret, KEY);
    expect(encrypted).not.toContain(Buffer.from(secret).toString('base64'));
    expect(createHash('sha256').update(encrypted).digest('hex')).not.toBe(
      createHash('sha256').update(secret).digest('hex'),
    );
    expect(randomBytes(8).length).toBe(8);
  });
});
