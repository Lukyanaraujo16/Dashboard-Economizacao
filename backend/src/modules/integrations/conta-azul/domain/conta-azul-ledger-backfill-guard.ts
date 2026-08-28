export type LedgerBackfillGuardInput = {
  readonly nodeEnv: string;
  readonly confirm: string | undefined;
  readonly databaseName: string;
};

export type BackfillConfirmMode = 'LOCAL' | 'PRODUCTION';

export type DatabaseBackfillClassification = 'local_dev' | 'local_test' | 'production';

export function databaseNameFromUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

export function isLocalDatabaseName(databaseName: string): boolean {
  return databaseName.endsWith('_dev') || databaseName.endsWith('_test');
}

/** Classificação segura para logs (sem credenciais). */
export function classifyDatabaseName(databaseName: string): DatabaseBackfillClassification {
  if (databaseName.endsWith('_dev')) {
    return 'local_dev';
  }
  if (databaseName.endsWith('_test')) {
    return 'local_test';
  }
  return 'production';
}

/**
 * CASH-7: backfill LOCAL (_dev/_test + --confirm=LOCAL) ou produção explícita
 * (NODE_ENV=production + banco real + --confirm=PRODUCTION). Fail-closed.
 */
export function assertLedgerBackfillAllowed(input: LedgerBackfillGuardInput): void {
  assertBackfillAllowed(input, 'CASH-7');
}

/**
 * CASH-9C: mesma política de autorização que CASH-7.
 */
export function assertTransferBackfillAllowed(input: LedgerBackfillGuardInput): void {
  assertBackfillAllowed(input, 'CASH-9C');
}

function assertBackfillAllowed(input: LedgerBackfillGuardInput, phase: string): void {
  const { nodeEnv, confirm, databaseName } = input;
  const isProductionEnv = nodeEnv === 'production';
  const isLocalDb = isLocalDatabaseName(databaseName);

  if (confirm === undefined || confirm.trim() === '') {
    throw new Error(
      `${phase} recusado: --confirm=LOCAL ou --confirm=PRODUCTION é obrigatório.`,
    );
  }

  if (confirm !== 'LOCAL' && confirm !== 'PRODUCTION') {
    throw new Error(`${phase} recusado: --confirm inválido (use LOCAL ou PRODUCTION).`);
  }

  if (confirm === 'LOCAL') {
    if (isProductionEnv) {
      throw new Error(
        `${phase} recusado: --confirm=LOCAL não é permitido com NODE_ENV=production.`,
      );
    }
    if (!isLocalDb) {
      throw new Error(
        `${phase} recusado: --confirm=LOCAL exige banco terminando em _dev ou _test.`,
      );
    }
    return;
  }

  if (!isProductionEnv) {
    throw new Error(`${phase} recusado: --confirm=PRODUCTION exige NODE_ENV=production.`);
  }
  if (isLocalDb) {
    throw new Error(
      `${phase} recusado: --confirm=PRODUCTION não é permitido em banco _dev/_test.`,
    );
  }
}
