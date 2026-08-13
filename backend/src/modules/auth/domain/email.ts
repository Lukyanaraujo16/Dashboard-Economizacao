/**
 * Normalização de e-mail antes da persistência.
 * Unicidade global é case-insensitive via lowercase + constraint no banco.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
