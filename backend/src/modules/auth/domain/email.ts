const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalização de e-mail antes da persistência.
 * Unicidade global é case-insensitive via lowercase + constraint no banco.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = email.trim();
  return normalized.length > 0 && EMAIL_PATTERN.test(normalized);
}
