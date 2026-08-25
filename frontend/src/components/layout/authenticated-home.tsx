'use client';

import { Suspense } from 'react';

import { RequireTenantSurface } from '../../auth';
import { DashboardPage } from '../dashboard';

/**
 * Home autenticada em `/` — Dashboard da empresa cliente (10B + M1).
 */
export function AuthenticatedHome() {
  return (
    <RequireTenantSurface>
      <Suspense fallback={null}>
        <DashboardPage />
      </Suspense>
    </RequireTenantSurface>
  );
}
