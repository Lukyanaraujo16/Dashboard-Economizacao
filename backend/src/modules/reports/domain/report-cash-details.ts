import { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import {
  collectAttributedCashSettlements,
  type CalculateMonthlyCashFlowInput,
} from '../../analytics/domain/monthly-cash-flow.js';
import {
  accumulateReceivableOverdue,
  selectExpectedOpenReceivables,
} from '../../analytics/domain/expected-open-receivables.js';
import {
  accumulatePayableOverdue,
  selectExpectedOpenPayables,
} from '../../analytics/domain/expected-open-payables.js';
import { resolveReceivableCategoryNames } from '../../analytics/domain/expected-receivable-details.js';
import { resolvePayableCategoryNames } from '../../analytics/domain/expected-payable-details.js';

const ZERO = new Prisma.Decimal(0);

export const REPORT_DETAIL_SITUATIONS = ['REALIZED', 'EXPECTED', 'OVERDUE'] as const;
export type ReportDetailSituation = (typeof REPORT_DETAIL_SITUATIONS)[number];

export const REPORT_DETAIL_DIRECTIONS = ['revenue', 'expenses'] as const;
export type ReportDetailDirection = (typeof REPORT_DETAIL_DIRECTIONS)[number];

export const REPORT_CASH_DETAILS_DEFAULT_LIMIT = 100;
export const REPORT_CASH_DETAILS_MAX_LIMIT = 200;

export type ReportCashDetailUnavailableReason = 'COST_CENTER_SPLIT';

export type ReportCashDetailItem = {
  readonly date: Date;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly costCenterNames: readonly string[];
  readonly situation: ReportDetailSituation;
  readonly amount: Prisma.Decimal;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly installmentExternalId: string;
  readonly settlementExternalId?: string;
};

export type ReportCashDetailsUniverse = {
  readonly available: boolean;
  readonly unavailableReason: ReportCashDetailUnavailableReason | null;
  readonly situation: ReportDetailSituation;
  readonly direction: ReportDetailDirection;
  readonly totalAmount: Prisma.Decimal | null;
  readonly items: readonly ReportCashDetailItem[];
};

export type ReportCashDetails = ReportCashDetailsUniverse & {
  readonly from: Date;
  readonly to: Date;
  readonly today: Date;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
};

export type BuildReportCashDetailsInput = {
  readonly cashFlowInput: CalculateMonthlyCashFlowInput;
  readonly direction: ReportDetailDirection;
  readonly situation: ReportDetailSituation;
  readonly partyNames: ReadonlyMap<string, string>;
  readonly costCenterNamesByInstallment: ReadonlyMap<string, readonly string[]>;
  readonly filteredCostCenterName: string | null;
  readonly limit: number;
  readonly offset: number;
};

function installmentMapKey(
  kind: 'RECEIVABLE' | 'PAYABLE',
  externalId: string,
): string {
  return `${kind}:${externalId}`;
}

function partyNameOf(
  installment: FinancialInstallmentReadRecord | undefined,
  partyNames: ReadonlyMap<string, string>,
): string | null {
  const partyId = installment?.partyId;
  if (!partyId) {
    return null;
  }
  return partyNames.get(partyId) ?? null;
}

function costCenterNamesOf(
  kind: 'RECEIVABLE' | 'PAYABLE',
  externalId: string,
  filteredName: string | null,
  namesByInstallment: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  if (filteredName !== null) {
    return [filteredName];
  }
  return namesByInstallment.get(installmentMapKey(kind, externalId)) ?? [];
}

function categoryCatalog(
  categories: readonly Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>[],
): Map<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>> {
  return new Map(categories.map((category) => [category.externalId, category]));
}

function compareDetailItems(left: ReportCashDetailItem, right: ReportCashDetailItem): number {
  const byDate = right.date.getTime() - left.date.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  const leftSettlement = left.settlementExternalId ?? '';
  const rightSettlement = right.settlementExternalId ?? '';
  const bySettlement = leftSettlement.localeCompare(rightSettlement);
  if (bySettlement !== 0) {
    return bySettlement;
  }
  const byKind = left.installmentKind.localeCompare(right.installmentKind);
  if (byKind !== 0) {
    return byKind;
  }
  return left.installmentExternalId.localeCompare(right.installmentExternalId);
}

function emptyUniverse(
  input: Pick<BuildReportCashDetailsInput, 'direction' | 'situation'>,
  reason: ReportCashDetailUnavailableReason | null,
): ReportCashDetailsUniverse {
  return {
    available: reason === null,
    unavailableReason: reason,
    situation: input.situation,
    direction: input.direction,
    totalAmount: reason === null ? ZERO : null,
    items: [],
  };
}

function expectedRows(
  cash: CalculateMonthlyCashFlowInput,
  direction: ReportDetailDirection,
): readonly { readonly amount: Prisma.Decimal; readonly installment: FinancialInstallmentReadRecord }[] {
  if (direction === 'revenue') {
    if (cash.costCenter) {
      return cash.costCenter.expectedReceivables;
    }
    return cash.receivables.map((installment) => ({
      amount: installment.unpaid,
      installment,
    }));
  }
  if (cash.costCenter) {
    return cash.costCenter.expectedPayables;
  }
  return cash.payables.map((installment) => ({
    amount: installment.unpaid,
    installment,
  }));
}

/**
 * Universo completo dos lançamentos (sem paginação) — mesma atribuição do MonthlyCashFlow.
 * Exporters futuros devem consumir este resultado, não o recorte HTTP.
 */
export function collectReportCashDetailUniverse(
  input: Omit<BuildReportCashDetailsInput, 'limit' | 'offset'>,
): ReportCashDetailsUniverse {
  const cash = input.cashFlowInput;
  const categoryFilter = cash.categoryFilter ?? null;
  const hasCostCenter = Boolean(cash.costCenter);
  const catalog = categoryCatalog(cash.categories ?? []);
  const expectedType = input.direction === 'revenue' ? 'REVENUE' : 'EXPENSE';

  if (input.situation === 'REALIZED') {
    const attributed = collectAttributedCashSettlements({
      today: cash.today,
      from: cash.from,
      to: cash.to,
      settlements: cash.settlements,
      realizedInstallments: cash.realizedInstallments,
      categoryFilter,
      costCenter: cash.costCenter,
    });
    if (!attributed.available) {
      return emptyUniverse(input, 'COST_CENTER_SPLIT');
    }
    const wantedType = input.direction === 'revenue' ? 'RECEIPT' : 'DISBURSEMENT';
    const items: ReportCashDetailItem[] = [];
    let total = ZERO;
    for (const row of attributed.rows) {
      if (row.settlement.transactionType !== wantedType) {
        continue;
      }
      const installment = cash.realizedInstallments?.get(
        installmentMapKey(row.settlement.installmentKind, row.settlement.installmentExternalId),
      );
      const settlementExternalId = row.settlement.settlementExternalId?.trim() || undefined;
      items.push({
        date: row.settlement.occurredOn,
        description: installment?.description ?? null,
        partyName: partyNameOf(installment, input.partyNames),
        categoryNames:
          expectedType === 'REVENUE'
            ? resolveReceivableCategoryNames(row.categoryExternalIds, catalog)
            : resolvePayableCategoryNames(row.categoryExternalIds, catalog),
        costCenterNames: costCenterNamesOf(
          row.settlement.installmentKind,
          row.settlement.installmentExternalId,
          input.filteredCostCenterName,
          input.costCenterNamesByInstallment,
        ),
        situation: 'REALIZED',
        amount: row.attributedAmount,
        installmentKind: row.settlement.installmentKind,
        installmentExternalId: row.settlement.installmentExternalId,
        ...(settlementExternalId === undefined ? {} : { settlementExternalId }),
      });
      total = total.plus(row.attributedAmount);
    }
    items.sort(compareDetailItems);
    return {
      available: true,
      unavailableReason: null,
      situation: input.situation,
      direction: input.direction,
      totalAmount: total,
      items,
    };
  }

  const rows = expectedRows(cash, input.direction);
  if (input.situation === 'EXPECTED') {
    const selected =
      input.direction === 'revenue'
        ? selectExpectedOpenReceivables({
            rows,
            today: cash.today,
            from: cash.from,
            to: cash.to,
            categoryFilter,
            hasCostCenter,
          })
        : selectExpectedOpenPayables({
            rows,
            today: cash.today,
            from: cash.from,
            to: cash.to,
            categoryFilter,
            hasCostCenter,
          });
    if (!selected.available) {
      return emptyUniverse(input, 'COST_CENTER_SPLIT');
    }
    const items: ReportCashDetailItem[] = selected.items.map((row) => ({
      date: row.installment.dueDate,
      description: row.installment.description,
      partyName: partyNameOf(row.installment, input.partyNames),
      categoryNames:
        expectedType === 'REVENUE'
          ? resolveReceivableCategoryNames(row.installment.categoryExternalIds, catalog)
          : resolvePayableCategoryNames(row.installment.categoryExternalIds, catalog),
      costCenterNames: costCenterNamesOf(
        input.direction === 'revenue' ? 'RECEIVABLE' : 'PAYABLE',
        row.installment.externalId,
        input.filteredCostCenterName,
        input.costCenterNamesByInstallment,
      ),
      situation: 'EXPECTED',
      amount: row.amount,
      installmentKind: input.direction === 'revenue' ? 'RECEIVABLE' : 'PAYABLE',
      installmentExternalId: row.installment.externalId,
    }));
    items.sort(compareDetailItems);
    return {
      available: true,
      unavailableReason: null,
      situation: input.situation,
      direction: input.direction,
      totalAmount: selected.total,
      items,
    };
  }

  const overdue =
    input.direction === 'revenue'
      ? accumulateReceivableOverdue({
          rows,
          today: cash.today,
          from: cash.from,
          to: cash.to,
          categoryFilter,
          hasCostCenter,
        })
      : accumulatePayableOverdue({
          rows,
          today: cash.today,
          from: cash.from,
          to: cash.to,
          categoryFilter,
          hasCostCenter,
        });
  if (!overdue.available) {
    return emptyUniverse(input, 'COST_CENTER_SPLIT');
  }
  const items: ReportCashDetailItem[] = overdue.ofMonthItems.map((row) => ({
    date: row.installment.dueDate,
    description: row.installment.description,
    partyName: partyNameOf(row.installment, input.partyNames),
    categoryNames:
      expectedType === 'REVENUE'
        ? resolveReceivableCategoryNames(row.installment.categoryExternalIds, catalog)
        : resolvePayableCategoryNames(row.installment.categoryExternalIds, catalog),
    costCenterNames: costCenterNamesOf(
      input.direction === 'revenue' ? 'RECEIVABLE' : 'PAYABLE',
      row.installment.externalId,
      input.filteredCostCenterName,
      input.costCenterNamesByInstallment,
    ),
    situation: 'OVERDUE',
    amount: row.amount,
    installmentKind: input.direction === 'revenue' ? 'RECEIVABLE' : 'PAYABLE',
    installmentExternalId: row.installment.externalId,
  }));
  items.sort(compareDetailItems);
  return {
    available: true,
    unavailableReason: null,
    situation: input.situation,
    direction: input.direction,
    totalAmount: overdue.overdueOfMonth,
    items,
  };
}

export function paginateReportCashDetails(
  universe: ReportCashDetailsUniverse,
  input: {
    readonly from: Date;
    readonly to: Date;
    readonly today: Date;
    readonly limit: number;
    readonly offset: number;
  },
): ReportCashDetails {
  const offset = Math.max(0, input.offset);
  const limit = Math.max(0, input.limit);
  return {
    ...universe,
    from: input.from,
    to: input.to,
    today: input.today,
    itemCount: universe.items.length,
    limit,
    offset,
    items: universe.available ? universe.items.slice(offset, offset + limit) : [],
  };
}

export function buildReportCashDetails(input: BuildReportCashDetailsInput): ReportCashDetails {
  const universe = collectReportCashDetailUniverse(input);
  return paginateReportCashDetails(universe, {
    from: input.cashFlowInput.from,
    to: input.cashFlowInput.to,
    today: input.cashFlowInput.today,
    limit: input.limit,
    offset: input.offset,
  });
}

export function clampReportCashDetailsLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return REPORT_CASH_DETAILS_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(0, Math.trunc(limit)), REPORT_CASH_DETAILS_MAX_LIMIT);
}

export function clampReportCashDetailsOffset(offset: number | undefined): number {
  if (offset === undefined || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

export function isReportDetailSituation(value: string): value is ReportDetailSituation {
  return (REPORT_DETAIL_SITUATIONS as readonly string[]).includes(value);
}
