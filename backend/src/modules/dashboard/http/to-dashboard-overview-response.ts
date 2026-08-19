import type { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialStockSnapshot } from '../../analytics/domain/types.js';
import type { ContaAzulIntegrationRecord } from '../../integrations/conta-azul/domain/types.js';
import { toPublicErrorCode } from '../../integrations/conta-azul/domain/types.js';
import type { DashboardOverviewMoneySnapshot, DashboardOverviewResponse } from '../domain/types.js';

export function serializeDecimal(value: Prisma.Decimal): string {
  return value.toString();
}

export function serializeCivilDate(today: Date): string {
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeSnapshot(snapshot: {
  readonly open: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
  readonly upcoming: Prisma.Decimal;
}): DashboardOverviewMoneySnapshot {
  return {
    open: serializeDecimal(snapshot.open),
    overdue: serializeDecimal(snapshot.overdue),
    upcoming: serializeDecimal(snapshot.upcoming),
  };
}

export function toDashboardOverviewResponse(
  snapshot: FinancialStockSnapshot,
  integration: ContaAzulIntegrationRecord | null,
): DashboardOverviewResponse {
  return {
    today: serializeCivilDate(snapshot.today),
    receivables: serializeSnapshot(snapshot.receivables),
    payables: serializeSnapshot(snapshot.payables),
    delinquency: {
      overdueUnpaid: serializeDecimal(snapshot.receivableDelinquency.overdueUnpaid),
      openUnpaid: serializeDecimal(snapshot.receivableDelinquency.openUnpaid),
      rate:
        snapshot.receivableDelinquency.rate === null
          ? null
          : serializeDecimal(snapshot.receivableDelinquency.rate),
    },
    integration: {
      status: integration?.status ?? 'DISCONNECTED',
      lastSuccessfulSyncAt: integration?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastErrorCode: toPublicErrorCode(integration?.lastErrorCode ?? null),
    },
  };
}
