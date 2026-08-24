import type {
  FinancialCategoryType,
  FinancialInstallmentStatus,
  Prisma,
} from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';

/** Contrato Home F11-B. Não é `FinancialInstallmentStatus`. */
export const DASHBOARD_SITUATIONS = ['settled', 'open', 'overdue'] as const;

export type DashboardSituation = (typeof DASHBOARD_SITUATIONS)[number];

export type DashboardCategoryFilter = {
  readonly externalId: string;
  readonly type: FinancialCategoryType;
};

export type DashboardHomeFilterable = {
  readonly status: FinancialInstallmentStatus;
  readonly unpaid: Prisma.Decimal;
  readonly dueDate: Date;
  readonly categoryExternalIds: readonly string[];
};

const OPEN_SITUATION_STATUSES: ReadonlySet<string> = new Set(ACTIVE_INSTALLMENT_STATUSES);

export function isDashboardSituation(value: string): value is DashboardSituation {
  return (DASHBOARD_SITUATIONS as readonly string[]).includes(value);
}

/**
 * D1: vencido = unpaid > 0, status ativo, dueDate < hoje civil SP.
 * `dueDate == hoje` não é vencido. Não usa `status === OVERDUE` como fonte.
 */
export function isDashboardOverdue(
  installment: Pick<DashboardHomeFilterable, 'status' | 'unpaid' | 'dueDate'>,
  today: Date,
): boolean {
  if (!OPEN_SITUATION_STATUSES.has(installment.status)) {
    return false;
  }
  if (!installment.unpaid.greaterThan(0)) {
    return false;
  }
  return installment.dueDate.getTime() < today.getTime();
}

export function matchesDashboardSituation(
  installment: Pick<DashboardHomeFilterable, 'status' | 'unpaid' | 'dueDate'>,
  situation: DashboardSituation | null,
  today: Date,
): boolean {
  if (situation === null) {
    return true;
  }
  if (situation === 'settled') {
    return installment.status === 'PAID';
  }
  if (situation === 'open') {
    return OPEN_SITUATION_STATUSES.has(installment.status);
  }
  return isDashboardOverdue(installment, today);
}

/** Ids únicos não vazios — mesmo critério D8 (sem rateio, sem multi). */
export function uniqueDashboardCategoryExternalIds(
  raw: readonly string[],
): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = value.trim();
    if (id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Match nomeado D8: um único externalId, exatamente o da categoria filtrada.
 * Sem categoria, multi-categoria e rollup de pai ficam de fora.
 */
export function matchesPreciseNamedCategory(
  categoryExternalIds: readonly string[],
  namedExternalId: string,
): boolean {
  const ids = uniqueDashboardCategoryExternalIds(categoryExternalIds);
  return ids.length === 1 && ids[0] === namedExternalId;
}

/**
 * `expectedType` é o lado do agregado (REVENUE=AR, EXPENSE=AP).
 * Categoria de tipo incompatível → nenhum título (vazio, não 400).
 * UNKNOWN nunca é classificação precisa D8 em AR/AP mensal.
 */
export function matchesDashboardCategoryFilter(
  installment: Pick<DashboardHomeFilterable, 'categoryExternalIds'>,
  categoryFilter: DashboardCategoryFilter | null,
  expectedType: FinancialCategoryType,
): boolean {
  if (categoryFilter === null) {
    return true;
  }
  if (categoryFilter.type !== expectedType) {
    return false;
  }
  return matchesPreciseNamedCategory(
    installment.categoryExternalIds,
    categoryFilter.externalId,
  );
}

export function applyDashboardHomeFilters<T extends DashboardHomeFilterable>(
  rows: readonly T[],
  options: {
    readonly situation: DashboardSituation | null;
    readonly categoryFilter: DashboardCategoryFilter | null;
    readonly expectedType: FinancialCategoryType;
    readonly today: Date;
  },
): readonly T[] {
  return rows.filter(
    (row) =>
      matchesDashboardSituation(row, options.situation, options.today) &&
      matchesDashboardCategoryFilter(row, options.categoryFilter, options.expectedType),
  );
}
