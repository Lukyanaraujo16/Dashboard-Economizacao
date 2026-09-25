import { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import {
  resolveCashAttributedCategoryBucket,
  type CashRealizedCategoryIdentity,
} from './cash-realized-category-composition.js';
import type { CompositionCategoryType } from './payable-category-composition.js';
import {
  collectAttributedCashSettlements,
  type AttributedCashSettlement,
  type CalculateMonthlyCashFlowInput,
  type CashSettlementSource,
} from './monthly-cash-flow.js';

const ZERO = new Prisma.Decimal(0);

export type CashRealizedDetailsDirection = 'inflows' | 'outflows';

/** Kind do bucket D8 — distingue nominal de uncategorized/imprecise quando a key colide. */
export type CashRealizedCategoryKind = CashRealizedCategoryIdentity['kind'];

export type CashRealizedDetailItem = {
  readonly settlementExternalId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly occurredOn: Date;
  /** netAmount bruto da baixa no ledger. */
  readonly netAmount: Prisma.Decimal;
  /**
   * Valor atribuído à categoria/filtro (pode ser fração do net sob CC).
   * Reconcilia com realizedByCategory.*.items[key].amount.
   */
  readonly attributedAmount: Prisma.Decimal;
  readonly description: string | null;
  readonly partyId: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly categoryExternalIds: readonly string[];
  readonly categoryKey: string;
  readonly categoryKind: CashRealizedCategoryIdentity['kind'];
  readonly categoryName: string;
};

export type CashRealizedDetails = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly today: Date;
  readonly direction: CashRealizedDetailsDirection;
  readonly categoryKey: string;
  /** Presente quando a query enviou categoryKind (desambiguação kind+key). */
  readonly categoryKind: CashRealizedCategoryKind | null;
  readonly available: boolean;
  /** Σ attributedAmount de TODOS os itens da categoria (não só a página). */
  readonly total: Prisma.Decimal | null;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly CashRealizedDetailItem[];
};

export type BuildCashRealizedDetailsInput = {
  readonly tenantId: string;
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly categoryKey: string;
  /** Quando informado, filtra kind+key (elimina colisão residual). */
  readonly categoryKind?: CashRealizedCategoryKind | null;
  readonly settlements: readonly CashSettlementSource[];
  readonly realizedInstallments: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  readonly categories: readonly Pick<
    FinancialCategoryReadRecord,
    'externalId' | 'name' | 'type'
  >[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categoryFilter?: CalculateMonthlyCashFlowInput['categoryFilter'];
  readonly costCenter?: CalculateMonthlyCashFlowInput['costCenter'];
  readonly limit: number;
  readonly offset: number;
};

function installmentMapKey(
  kind: 'RECEIVABLE' | 'PAYABLE',
  externalId: string,
): string {
  return `${kind}:${externalId}`;
}

function expectedTypeForDirection(
  direction: CashRealizedDetailsDirection,
): CompositionCategoryType {
  return direction === 'inflows' ? 'REVENUE' : 'EXPENSE';
}

function transactionTypeForDirection(
  direction: CashRealizedDetailsDirection,
): CashSettlementSource['transactionType'] {
  return direction === 'inflows' ? 'RECEIPT' : 'DISBURSEMENT';
}

function resolveCategoryNames(
  categoryExternalIds: readonly string[],
  catalog: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>,
  expectedType: CompositionCategoryType,
): string[] {
  const names: string[] = [];
  for (const externalId of categoryExternalIds) {
    const category = catalog.get(externalId);
    if (category?.type === expectedType) {
      names.push(category.name);
    }
  }
  return names;
}

function compareDetailItems(left: CashRealizedDetailItem, right: CashRealizedDetailItem): number {
  const byDate = left.occurredOn.getTime() - right.occurredOn.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  const bySettlement = left.settlementExternalId.localeCompare(right.settlementExternalId);
  if (bySettlement !== 0) {
    return bySettlement;
  }
  return left.installmentExternalId.localeCompare(right.installmentExternalId);
}

function toDetailItem(input: {
  readonly row: AttributedCashSettlement;
  readonly bucket: CashRealizedCategoryIdentity;
  readonly installment: FinancialInstallmentReadRecord | undefined;
  readonly partyNames: ReadonlyMap<string, string>;
  readonly catalog: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>;
  readonly expectedType: CompositionCategoryType;
}): CashRealizedDetailItem {
  const { row, bucket, installment } = input;
  const settlementExternalId =
    row.settlement.settlementExternalId?.trim() ||
    `${row.settlement.installmentKind}:${row.settlement.installmentExternalId}:${row.settlement.occurredOn.toISOString()}`;
  const partyId = installment?.partyId ?? null;
  return {
    settlementExternalId,
    installmentExternalId: row.settlement.installmentExternalId,
    installmentKind: row.settlement.installmentKind,
    occurredOn: row.settlement.occurredOn,
    netAmount: row.settlement.netAmount,
    attributedAmount: row.attributedAmount,
    description: installment?.description ?? null,
    partyId,
    partyName: partyId ? (input.partyNames.get(partyId) ?? null) : null,
    categoryNames: resolveCategoryNames(
      row.categoryExternalIds,
      input.catalog,
      input.expectedType,
    ),
    categoryExternalIds: [...row.categoryExternalIds],
    categoryKey: bucket.key,
    categoryKind: bucket.kind,
    categoryName: bucket.name,
  };
}

/**
 * Detalhe das baixas realizadas de uma categoryKey — mesma atribuição do MonthlyCashFlow.
 * Paginação fatia `items`; `total`/`itemCount` cobrem o universo completo da categoria.
 */
export function buildCashRealizedDetails(
  input: BuildCashRealizedDetailsInput,
): CashRealizedDetails {
  const expectedType = expectedTypeForDirection(input.direction);
  const wantedType = transactionTypeForDirection(input.direction);
  const catalog = new Map(input.categories.map((category) => [category.externalId, category]));
  const categoryKind = input.categoryKind ?? null;
  const attributed = collectAttributedCashSettlements({
    today: input.today,
    from: input.from,
    to: input.to,
    settlements: input.settlements,
    realizedInstallments: input.realizedInstallments,
    categoryFilter: input.categoryFilter ?? null,
    costCenter: input.costCenter,
  });

  if (!attributed.available) {
    return {
      tenantId: input.tenantId,
      monthKey: input.monthKey,
      from: input.from,
      to: input.to,
      today: input.today,
      direction: input.direction,
      categoryKey: input.categoryKey,
      categoryKind,
      available: false,
      total: null,
      itemCount: 0,
      limit: input.limit,
      offset: input.offset,
      items: [],
    };
  }

  const matched: CashRealizedDetailItem[] = [];
  let total = ZERO;

  for (const row of attributed.rows) {
    if (row.settlement.transactionType !== wantedType) {
      continue;
    }
    const bucket = resolveCashAttributedCategoryBucket(
      row.categoryExternalIds,
      input.categories,
      expectedType,
    );
    if (bucket.key !== input.categoryKey) {
      continue;
    }
    if (categoryKind !== null && bucket.kind !== categoryKind) {
      continue;
    }
    const installment = input.realizedInstallments.get(
      installmentMapKey(row.settlement.installmentKind, row.settlement.installmentExternalId),
    );
    const item = toDetailItem({
      row,
      bucket,
      installment,
      partyNames: input.partyNames,
      catalog,
      expectedType,
    });
    matched.push(item);
    total = total.plus(item.attributedAmount);
  }

  matched.sort(compareDetailItems);
  const offset = Math.max(0, input.offset);
  const limit = Math.max(0, input.limit);
  const page = matched.slice(offset, offset + limit);

  return {
    tenantId: input.tenantId,
    monthKey: input.monthKey,
    from: input.from,
    to: input.to,
    today: input.today,
    direction: input.direction,
    categoryKey: input.categoryKey,
    categoryKind,
    available: true,
    total,
    itemCount: matched.length,
    limit,
    offset,
    items: page,
  };
}
