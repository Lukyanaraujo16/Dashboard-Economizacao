import { ContaAzulApiError } from '../connector/conta-azul-api-client.js';
import type { ContaAzulSyncErrorCode } from '../domain/conta-azul-sync.js';

/** Etapa do sync em execução quando a falha ocorreu (diagnóstico, não contrato público). */
export type ContaAzulSyncStage =
  | 'setup'
  | 'categories'
  | 'financial_accounts'
  | 'balances'
  | 'people'
  | 'hot_receivables_due'
  | 'hot_receivables_payment'
  | 'hot_receivables_persist'
  | 'hot_payables_due'
  | 'hot_payables_payment'
  | 'hot_payables_persist'
  | 'parties_full'
  | 'receivables_full'
  | 'payables_full'
  | 'installment_presence'
  | 'cost_centers'
  | 'ledger'
  | 'transfers'
  | 'finalize'
  | 'worker';

export type ContaAzulSyncFailureDiagnostic = {
  readonly event: 'conta_azul_sync_failure_diagnostic';
  readonly syncRunId: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly trigger: string | null;
  readonly stage: ContaAzulSyncStage;
  readonly errorCode: ContaAzulSyncErrorCode;
  readonly failureKind: string | null;
  readonly httpStatus: number | null;
  readonly endpoint: string | null;
  readonly upstreamCode: string | null;
};

const MAX_CAUSE_DEPTH = 5;

/** Primeiro ContaAzulApiError na cadeia de `cause` (erros de etapa embrulham o original). */
export function findContaAzulApiError(error: unknown): ContaAzulApiError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    if (current instanceof ContaAzulApiError) {
      return current;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Metadados seguros da falha. Só campos derivados do erro tipado:
 * nunca token, header, query string, mensagem livre da origem ou payload.
 */
export function buildSyncFailureDiagnostic(input: {
  readonly syncRunId: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly trigger: string | null;
  readonly stage: ContaAzulSyncStage;
  readonly errorCode: ContaAzulSyncErrorCode;
  readonly error: unknown;
}): ContaAzulSyncFailureDiagnostic {
  const api = findContaAzulApiError(input.error);
  return {
    event: 'conta_azul_sync_failure_diagnostic',
    syncRunId: input.syncRunId,
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    trigger: input.trigger,
    stage: input.stage,
    errorCode: input.errorCode,
    failureKind: api ? api.kind : input.error instanceof Error ? input.error.name : null,
    httpStatus: api?.httpStatus ?? null,
    endpoint: api?.endpoint ?? null,
    upstreamCode: api?.upstreamCode ?? null,
  };
}
