export { normalizeEmail } from './email.js';
export {
  AUTH_LOCKOUT_DURATION_MINUTES,
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
  computeLockoutUntil,
  isTemporaryLockoutActive,
  isTemporaryLockoutExpired,
} from './auth-lockout.js';
export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isPasswordLengthValid,
} from './password-policy.js';
export { AuthDomainError, assertUserTenantRoleConsistency } from './user-invariants.js';
export type { AuthenticatedPrincipal, AuthenticationContext } from './authentication-context.js';
export type {
  CreateTenantInput,
  CreateUserInput,
  TenantRecord,
  TenantStatus,
  UserCredentialRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from './types.js';
export { TENANT_STATUSES, USER_ROLES, USER_STATUSES } from './types.js';
