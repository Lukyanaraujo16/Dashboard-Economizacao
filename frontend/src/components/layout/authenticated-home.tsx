'use client';

import { Suspense } from 'react';

import { DashboardPage } from '../dashboard';

/**
 * Home autenticada em `/` — Dashboard da empresa cliente (10B + M1).
 */
export function AuthenticatedHome() {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
