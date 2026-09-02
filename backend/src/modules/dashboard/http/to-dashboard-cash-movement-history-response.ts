import type { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCashFlow } from '../../analytics/domain/types.js';
import type { DashboardCashMovementHistoryResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

/**
 * Serializa N MonthlyCashFlow (mesmo motor da Home) em histórico leve de realizado.
 * Preserva null de cost-center unavailable; não converte indisponibilidade em zero.
 */
export function toDashboardCashMovementHistoryResponse(
  flows: readonly MonthlyCashFlow[],
): DashboardCashMovementHistoryResponse {
  if (flows.length === 0) {
    throw new Error('cash-movement-history exige ao menos um MonthlyCashFlow.');
  }
  const start = flows[0]!;
  const end = flows[flows.length - 1]!;
  let costCenterCashSplit = true;
  const months = flows.map((flow) => {
    if (!flow.costCenterCashSplit) {
      costCenterCashSplit = false;
    }
    return {
      monthKey: flow.monthKey,
      realized: {
        inflows: serializeNullableDecimal(flow.realized.inflows),
        outflows: serializeNullableDecimal(flow.realized.outflows),
        result: serializeNullableDecimal(flow.realized.result),
      },
    };
  });
  return {
    today: serializeCivilDate(end.today),
    startMonth: start.monthKey,
    endMonth: end.monthKey,
    costCenterCashSplit,
    months,
  };
}
