export type LedgerBackfillGuardInput = {
  readonly nodeEnv: string;
  readonly confirm: string | undefined;
  readonly databaseName: string;
};

export function databaseNameFromUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

/**
 * CASH-7: backfill só em LOCAL (_dev/_test) com --confirm=LOCAL.
 * Produção permanece bloqueada nesta fase.
 */
export function assertLedgerBackfillAllowed(input: LedgerBackfillGuardInput): void {
  if (input.nodeEnv === 'production') {
    throw new Error(
      'CASH-7 recusado: NODE_ENV=production. Backfill de produção não está autorizado nesta fase.',
    );
  }
  if (input.confirm !== 'LOCAL') {
    throw new Error('CASH-7 recusado: use --confirm=LOCAL para executar o backfill local.');
  }
  if (!input.databaseName.endsWith('_dev') && !input.databaseName.endsWith('_test')) {
    throw new Error(
      'CASH-7 recusado: o banco deve terminar em _dev ou _test. Produção bloqueada.',
    );
  }
}
