import * as argon2 from 'argon2';

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
};

/**
 * Abstração única de hashing. Argon2id explícito; parâmetros padrão do package
 * (recomendação da implementação de referência / OWASP-friendly defaults).
 */
export function createArgon2idPasswordHasher(): PasswordHasher {
  return {
    async hash(password) {
      return argon2.hash(password, { type: argon2.argon2id });
    },

    async verify(passwordHash, password) {
      try {
        return await argon2.verify(passwordHash, password);
      } catch {
        return false;
      }
    },
  };
}
