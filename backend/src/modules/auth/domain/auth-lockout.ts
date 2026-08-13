/**
 * Política oficial de bloqueio por tentativas inválidas (1.1D).
 */
export const AUTH_MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const AUTH_LOCKOUT_DURATION_MINUTES = 15;

export function computeLockoutUntil(now: Date): Date {
  return new Date(now.getTime() + AUTH_LOCKOUT_DURATION_MINUTES * 60 * 1000);
}

export function isTemporaryLockoutActive(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function isTemporaryLockoutExpired(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() <= now.getTime();
}
