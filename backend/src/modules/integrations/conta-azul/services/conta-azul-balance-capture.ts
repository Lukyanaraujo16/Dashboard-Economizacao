import { type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { mapFinancialAccountCurrentBalance } from '../domain/conta-azul-balance-mappers.js';
import { civilTodayInSaoPaulo } from '../../../analytics/domain/analytical-timezone.js';
import type { ContaAzulFinancialRepository } from '../repositories/financial.repository.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';

export type BalanceSnapshotCaptureCounts = {
  readonly balanceSnapshotsAttempted: number;
  readonly balanceSnapshotsUpserted: number;
  readonly balanceSnapshotsFailed: number;
};

/**
 * Após sync de contas: captura saldo-atual só de contas ativas.
 * Falha de uma conta: registra contagem, não grava zero, não aborta as demais.
 * Não apaga snapshots de contas que ficaram inativas.
 */
export async function captureActiveAccountBalanceSnapshots(input: {
  readonly scope: FinancialSyncScope;
  readonly apiClient: ContaAzulApiClient;
  readonly financial: ContaAzulFinancialRepository;
  readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
  readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
  readonly heartbeat: () => Promise<void>;
  readonly now: Date;
}): Promise<BalanceSnapshotCaptureCounts> {
  const accounts = await input.financial.listActiveAccounts({
    tenantId: input.scope.tenantId,
    integrationId: input.scope.integrationId,
  });
  const balanceDate = civilTodayInSaoPaulo(input.now);
  let attempted = 0;
  let upserted = 0;
  let failed = 0;

  for (const account of accounts) {
    attempted += 1;
    try {
      const raw = await input.gatedGet(() =>
        input.requestWithAuth((accessToken) =>
          input.apiClient.getFinancialAccountCurrentBalance(accessToken, account.externalId),
        ),
      );
      const mapped = mapFinancialAccountCurrentBalance(raw);
      await input.financial.upsertDailyBalanceSnapshot({
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        financialAccountId: account.id,
        financialAccountExternalId: account.externalId,
        balance: mapped.balance,
        balanceDate,
        capturedAt: input.now,
        accountActiveAtCapture: true,
      });
      upserted += 1;
    } catch (error) {
      void error;
      failed += 1;
      // Continua demais contas; nunca persiste 0 fabricado.
    }
    await input.heartbeat();
  }

  return {
    balanceSnapshotsAttempted: attempted,
    balanceSnapshotsUpserted: upserted,
    balanceSnapshotsFailed: failed,
  };
}
