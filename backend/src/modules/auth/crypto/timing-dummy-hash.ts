import type { PasswordHasher } from '../crypto/password-hasher.js';

/**
 * Hash Argon2id estático para equalizar timing quando não há credencial real.
 * Não representa usuário; gerado offline com a mesma família de parâmetros do hasher.
 */
export const TIMING_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$jhM7ntqW7FMEOpoExXNxyw$qxCX29WkcWpryZNLq4n8T7VDBrN+/lwnZ8qc9m3oupA';

export async function verifyWithTimingProtection(
  hasher: PasswordHasher,
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  const hash = passwordHash ?? TIMING_DUMMY_PASSWORD_HASH;
  return hasher.verify(hash, password);
}
