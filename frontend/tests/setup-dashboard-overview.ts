import { afterEach, beforeEach, vi } from 'vitest';

const NEVER_SYNCED_OVERVIEW = {
  today: '2026-08-19',
  receivables: { open: '0', overdue: '0', upcoming: '0' },
  payables: { open: '0', overdue: '0', upcoming: '0' },
  delinquency: { overdueUnpaid: '0', openUnpaid: '0', rate: null },
  integration: {
    status: 'DISCONNECTED',
    lastSuccessfulSyncAt: null,
    lastErrorCode: null,
  },
};

/**
 * Evita hang de GET /dashboard/overview em testes que montam `/`
 * sem stubar o service.
 */
beforeEach(() => {
  const previous = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.split('?')[0] ?? url;
    if (path.endsWith('/dashboard/overview')) {
      return Promise.resolve(
        new Response(JSON.stringify(NEVER_SYNCED_OVERVIEW), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (
      path.endsWith('/dashboard/upcoming') ||
      path.endsWith('/dashboard/expense-composition') ||
      path.endsWith('/dashboard/receivable-composition') ||
      path.endsWith('/dashboard/monthly-revenue') ||
      path.endsWith('/dashboard/executive-insights')
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return previous(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
