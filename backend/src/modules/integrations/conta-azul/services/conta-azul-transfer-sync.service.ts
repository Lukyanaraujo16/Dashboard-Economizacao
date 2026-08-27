import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { addUtcDays, formatCivilDate } from '../domain/conta-azul-dates.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import { mapFinancialTransferList } from '../domain/conta-azul-transfer-mappers.js';
import { CONTA_AZUL_SYNC_PAGE_SIZE, CONTA_AZUL_SYNC_WINDOW_DAYS } from '../domain/conta-azul-sync.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';
import type { ContaAzulTransferRepository } from '../repositories/transfer.repository.js';

export type TransferSyncSummary = {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly from: string;
  readonly to: string;
  readonly pages: number;
  readonly fetched: number;
  readonly upserted: number;
  readonly skippedInvalid: number;
  readonly matched: number;
  readonly unmatched: number;
  readonly ambiguous: number;
};

export type ContaAzulTransferSyncService = {
  sync(input: {
    readonly scope: FinancialSyncScope;
    readonly from: Date;
    readonly to: Date;
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat?: () => Promise<void>;
  }): Promise<TransferSyncSummary>;
};

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'rate_limited' || error.kind === 'timeout')
  );
}

function civilWindows(from: Date, to: Date, maxDays: number): Array<{ readonly de: Date; readonly ate: Date }> {
  const windows: Array<{ readonly de: Date; readonly ate: Date }> = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const windowEnd = addUtcDays(cursor, maxDays - 1);
    const ate = windowEnd.getTime() < to.getTime() ? windowEnd : to;
    windows.push({ de: cursor, ate });
    cursor = addUtcDays(ate, 1);
  }
  return windows;
}

export function createContaAzulTransferSyncService(deps: {
  readonly transfers: ContaAzulTransferRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulTransferSyncService {
  return {
    async sync(input) {
      const heartbeat = input.heartbeat ?? (async () => undefined);
      let pages = 0;
      let fetched = 0;
      let upserted = 0;
      let skippedInvalid = 0;

      for (const window of civilWindows(input.from, input.to, CONTA_AZUL_SYNC_WINDOW_DAYS)) {
        let pagina = 1;
        for (;;) {
          let payload: unknown;
          try {
            payload = await input.requestWithAuth((accessToken) =>
              input.gatedGet(() =>
                deps.apiClient.searchTransfers(accessToken, {
                  pagina,
                  dataInicio: formatCivilDate(window.de),
                  dataFim: formatCivilDate(window.ate),
                }),
              ),
            );
          } catch (error) {
            if (isAbortingApiError(error) || error instanceof ContaAzulMappingError) {
              throw error;
            }
            throw error;
          }
          const mapped = mapFinancialTransferList(payload);
          pages += 1;
          fetched += mapped.items.length + mapped.skippedInvalid;
          skippedInvalid += mapped.skippedInvalid;
          await deps.transfers.upsertTransfers(input.scope, mapped.items);
          upserted += mapped.items.length;
          await heartbeat();
          if (mapped.items.length + mapped.skippedInvalid < CONTA_AZUL_SYNC_PAGE_SIZE) {
            break;
          }
          pagina += 1;
        }
      }

      const matches = await deps.transfers.applyMatches(
        { tenantId: input.scope.tenantId, integrationId: input.scope.integrationId },
        input.from,
        input.to,
      );

      return {
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        from: formatCivilDate(input.from),
        to: formatCivilDate(input.to),
        pages,
        fetched,
        upserted,
        skippedInvalid,
        matched: matches.matched,
        unmatched: matches.unmatched,
        ambiguous: matches.ambiguous,
      };
    },
  };
}
