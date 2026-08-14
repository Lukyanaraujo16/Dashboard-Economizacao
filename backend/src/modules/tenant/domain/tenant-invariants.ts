import { TenantDomainError } from './tenant-domain-error.js';
import type { TenantRecord, TenantStatus } from './types.js';

/** Garante coerência entre status e deactivatedAt (docs/13 §6.1, TENANT-003). */
export function assertTenantStatusDeactivatedAtConsistency(
  status: TenantStatus,
  deactivatedAt: Date | null | undefined,
): void {
  const hasDeactivatedAt = deactivatedAt != null;

  if (status === 'ACTIVE' && hasDeactivatedAt) {
    throw new TenantDomainError(
      'TENANT_ACTIVE_REQUIRES_NULL_DEACTIVATED_AT',
      'Empresa ACTIVE não pode possuir deactivatedAt preenchido.',
    );
  }

  if (status === 'DISABLED' && !hasDeactivatedAt) {
    throw new TenantDomainError(
      'TENANT_DISABLED_REQUIRES_DEACTIVATED_AT',
      'Empresa DISABLED deve possuir deactivatedAt preenchido.',
    );
  }
}

export function assertTenantRecordConsistency(tenant: TenantRecord): void {
  assertTenantStatusDeactivatedAtConsistency(tenant.status, tenant.deactivatedAt);
}

export function buildActiveTenantFields(): {
  status: 'ACTIVE';
  deactivatedAt: null;
} {
  return {
    status: 'ACTIVE',
    deactivatedAt: null,
  };
}

export function buildDisabledTenantFields(at: Date): {
  status: 'DISABLED';
  deactivatedAt: Date;
} {
  return {
    status: 'DISABLED',
    deactivatedAt: at,
  };
}

/** Transição determinística ACTIVE → DISABLED. */
export function assertCanDisableTenant(tenant: TenantRecord): void {
  assertTenantRecordConsistency(tenant);

  if (tenant.status === 'DISABLED') {
    throw new TenantDomainError('TENANT_ALREADY_DISABLED', 'Empresa já está desativada.');
  }
}

/** Transição determinística DISABLED → ACTIVE (PRD TENANT-003 — reativação). */
export function assertCanReactivateTenant(tenant: TenantRecord): void {
  assertTenantRecordConsistency(tenant);

  if (tenant.status === 'ACTIVE') {
    throw new TenantDomainError('TENANT_ALREADY_ACTIVE', 'Empresa já está ativa.');
  }
}

export type TenantOperationalRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export function canRoleUseTenantOperationalContext(
  role: TenantOperationalRole,
  tenant: TenantRecord | null,
): boolean {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  if (role !== 'USER') {
    return false;
  }

  if (tenant === null) {
    return false;
  }

  assertTenantRecordConsistency(tenant);
  return tenant.status === 'ACTIVE' && tenant.deactivatedAt === null;
}
