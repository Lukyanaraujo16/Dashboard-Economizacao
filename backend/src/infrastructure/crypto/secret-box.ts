import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

export function parseIntegrationEncryptionKey(value: string | undefined): Buffer {
  const normalized = value?.trim() ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes). Gere com: openssl rand -hex 32',
    );
  }
  return Buffer.from(normalized, 'hex');
}

/**
 * AES-256-GCM envelope. Formato persistido: v1.{iv}.{ciphertext}.{tag} (base64url).
 * IV/nonce é único por operação. Tag detecta adulteração.
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  assertKey(key);
  if (plaintext.length === 0) {
    throw new SecretBoxError('Segredo vazio não pode ser cifrado.');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, toBase64Url(iv), toBase64Url(ciphertext), toBase64Url(tag)].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  assertKey(key);
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError('Envelope criptográfico inválido.');
  }

  const iv = fromBase64Url(parts[1]!);
  const ciphertext = fromBase64Url(parts[2]!);
  const tag = fromBase64Url(parts[3]!);

  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new SecretBoxError('Envelope criptográfico inválido.');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretBoxError('Não foi possível autenticar o segredo cifrado.');
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new SecretBoxError('Chave de cifragem inválida.');
  }
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
