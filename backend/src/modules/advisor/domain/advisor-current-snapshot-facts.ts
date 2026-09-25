import type { FinancialStockSnapshot, InstallmentPendingStock } from '../../analytics/domain/types.js';
import { formatAdvisorCivilDate, formatAdvisorFinancialAmount } from './financial-facts-text.js';

export const ADVISOR_CURRENT_SNAPSHOT_FACT_NAME = 'current_financial_snapshot';
export const ADVISOR_CURRENT_SNAPSHOT_FACT_KIND = 'CURRENT_FINANCIAL_SNAPSHOT';
export const ADVISOR_CURRENT_SNAPSHOT_TIMEZONE = 'America/Sao_Paulo';

export type AdvisorCurrentSnapshotSideFacts = {
  readonly open: string;
  readonly overdue: string;
  readonly dueToday: string;
  readonly upcomingFuture: string;
};

export type AdvisorCurrentSnapshotFacts = {
  readonly status: 'OK';
  readonly factKind: typeof ADVISOR_CURRENT_SNAPSHOT_FACT_KIND;
  readonly scope: 'CURRENT_SNAPSHOT';
  readonly asOf: string;
  readonly asOfTimeZone: typeof ADVISOR_CURRENT_SNAPSHOT_TIMEZONE;
  readonly receivables: AdvisorCurrentSnapshotSideFacts;
  readonly payables: AdvisorCurrentSnapshotSideFacts;
  readonly receivableDelinquency: {
    readonly overdueAmount: string;
    readonly openAmount: string;
    readonly percentage: string;
  };
};

/**
 * Projeta o snapshot oficial para o compositor.
 * dueToday/upcomingFuture só saem quando a paridade open = overdue + dueToday + upcoming vale
 * na mesma população de getFinancialStockSnapshot.
 */
export function serializeAdvisorCurrentSnapshotFacts(
  snapshot: FinancialStockSnapshot,
): AdvisorCurrentSnapshotFacts {
  return {
    status: 'OK',
    factKind: ADVISOR_CURRENT_SNAPSHOT_FACT_KIND,
    scope: 'CURRENT_SNAPSHOT',
    asOf: formatAdvisorCivilDate(snapshot.today),
    asOfTimeZone: ADVISOR_CURRENT_SNAPSHOT_TIMEZONE,
    receivables: serializeSide(snapshot.receivables, snapshot.pending?.receivables),
    payables: serializeSide(snapshot.payables, snapshot.pending?.payables),
    receivableDelinquency: {
      overdueAmount: formatAdvisorFinancialAmount(snapshot.receivableDelinquency.overdueUnpaid),
      openAmount: formatAdvisorFinancialAmount(snapshot.receivableDelinquency.openUnpaid),
      percentage: formatAdvisorFinancialAmount(snapshot.receivableDelinquency.rate),
    },
  };
}

function serializeSide(
  legacy: FinancialStockSnapshot['receivables'],
  pending: InstallmentPendingStock | undefined,
): AdvisorCurrentSnapshotSideFacts {
  const open = formatAdvisorFinancialAmount(legacy.open);
  const overdue = formatAdvisorFinancialAmount(legacy.overdue);
  if (pending === undefined) {
    return {
      open,
      overdue,
      dueToday: 'ABSENT',
      upcomingFuture: 'ABSENT',
    };
  }
  const matchesLegacy =
    pending.open.equals(legacy.open) && pending.overdue.equals(legacy.overdue);
  const matchesParity = pending.open.equals(
    pending.overdue.plus(pending.dueToday).plus(pending.upcoming),
  );
  if (!matchesLegacy || !matchesParity) {
    return {
      open,
      overdue,
      dueToday: 'UNAVAILABLE',
      upcomingFuture: 'UNAVAILABLE',
    };
  }
  return {
    open: formatAdvisorFinancialAmount(pending.open),
    overdue: formatAdvisorFinancialAmount(pending.overdue),
    dueToday: formatAdvisorFinancialAmount(pending.dueToday),
    upcomingFuture: formatAdvisorFinancialAmount(pending.upcoming),
  };
}
