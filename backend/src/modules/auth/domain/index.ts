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
export type {
  AuthenticatedPrincipal,
  AuthenticatedRequestContext,
  AuthenticationContext,
} from './authentication-context.js';
export type { CreateTenantInput, TenantRecord, TenantStatus } from '../../tenant/domain/types.js';
export { TENANT_STATUSES } from '../../tenant/domain/types.js';
export type {
  CreateUserInput,
  UserCredentialRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from './types.js';
export { USER_ROLES, USER_STATUSES } from './types.js';
