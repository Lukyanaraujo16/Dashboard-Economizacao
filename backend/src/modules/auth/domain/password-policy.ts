/**
 * Política estrutural de senha (docs/09.7: mínimo não inferior a 10).
 * Fluxo de definição/hash fica para subfases posteriores (Argon2id).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
