import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { collectCashCategoryExternalIds } from '../../analytics/domain/cash-realized-category-composition.js';
import { civilMonthBoundsFromKey } from '../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { classifyInstallmentDueSituation } from '../../analytics/domain/installment-due-situation.js';
import { resolvePayableCategoryNames } from '../../analytics/domain/expected-payable-details.js';
import { deriveInstallmentCostCenterCashSplit } from '../../analytics/domain/cost-center-cash-split.js';
import { AdvisorDomainError } from './advisor-domain-error.js';
import {
  resolveAdvisorCostCenterQuery,
  type AdvisorCostCenterCatalogItem,
} from './advisor-cost-center-dimension.js';
import type { AdvisorAnalyticalToolDefinition } from './advisor-analytical-tools.js';
import {
  PAYABLE_TITLES_TOOL_NAME,
  isAdvisorPayableTitleOrdering,
  isAdvisorPayableTitleStatus,
  rankAdvisorPayableTitles,
  resolvePayableTitlesLimits,
  serializeAdvisorPayableTitles,
  type AdvisorPayableTitleOrdering,
  type AdvisorPayableTitleSourceLine,
  type AdvisorPayableTitleStatus,
  type AdvisorPayableTitleWindow,
} from './advisor-payable-titles.js';

const ZERO = new Prisma.Decimal(0);

const COST_CENTER_QUERY_SCHEMA = {
  type: 'string',
  description:
    'Nome ou código textual do centro de custo. Match conservador no catálogo do tenant. Nunca envie id.',
  maxLength: 80,
};

export const PAYABLE_TITLES_TOOL: AdvisorAnalyticalToolDefinition = {
  name: PAYABLE_TITLES_TOOL_NAME,
  description:
    'Lists/ranks individual ACCOUNTS PAYABLE titles (obrigações/despesas registradas), not realized cash movements. Use for open/overdue/paid payable titles, largest obligations, earliest due dates. Domains: OPEN = unpaid titles with dueDate in month (Dashboard Contas a pagar population); OVERDUE = unpaid with dueDate < today; PAID = settled titles with dueDate in month; ALL = OPEN+PAID in the same title universe (does NOT sum realized cash + open). Distinct from cash_movement_lines (REALIZED_CASH DISBURSEMENT). Does not accept tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'status'],
    properties: {
      monthKey: {
        type: 'string',
        description: 'Mês civil YYYY-MM (filtro por vencimento/dueDate).',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      },
      status: {
        type: 'string',
        enum: ['OPEN', 'PAID', 'OVERDUE', 'ALL'],
        description:
          'OPEN=unpaid due in month; OVERDUE=unpaid past due in month; PAID=settled due in month; ALL=OPEN+PAID title universe.',
      },
      ordering: {
        type: 'string',
        enum: ['VALUE_DESC', 'DUE_DATE_ASC'],
        description:
          'VALUE_DESC = maiores valores (default). DUE_DATE_ASC = vencem primeiro.',
      },
      costCenterQuery: COST_CENTER_QUERY_SCHEMA,
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Quantidade máxima de títulos. Default 5, teto 20.',
      },
    },
  },
};

export type AdvisorPayableTitlesRequest = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly status: AdvisorPayableTitleStatus;
  readonly ordering: AdvisorPayableTitleOrdering;
  readonly limit?: number;
  readonly costCenterQuery?: string;
  readonly now?: Date;
};

export type AdvisorPayableTitlesService = {
  list(input: AdvisorPayableTitlesRequest): Promise<AdvisorPayableTitleWindow>;
};

export function createAdvisorPayableTitlesService(deps: {
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  readonly parties: PartyReadRepository;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
}): AdvisorPayableTitlesService {
  return {
    async list(input) {
      const tenantId = requireTenantId(input.tenantId);
      const today = civilTodayInSaoPaulo(input.now ?? new Date());
      const bounds = civilMonthBoundsFromKey(input.monthKey);
      const limits = resolvePayableTitlesLimits(input.limit);
      const scope = { tenantId };

      let costCenter: AdvisorPayableTitleWindow['costCenter'] = null;
      let entityScope: 'TENANT' | 'COST_CENTER' = 'TENANT';
      let rows: readonly {
        readonly amount: Prisma.Decimal;
        readonly installment: FinancialInstallmentReadRecord;
        readonly costCenterNames: readonly string[];
      }[];

      if (input.costCenterQuery !== undefined && input.costCenterQuery.trim() !== '') {
        if (deps.costCenterAllocations === undefined) {
          return rankAdvisorPayableTitles({
            monthKey: input.monthKey,
            titleStatus: input.status,
            ordering: input.ordering,
            requestedLimit: limits.requestedLimit,
            effectiveLimit: limits.effectiveLimit,
            available: false,
            entityScope: 'COST_CENTER',
            costCenter: null,
            items: [],
          });
        }
        const catalog = await loadCatalog(deps.costCenters, tenantId);
        const resolved = resolveAdvisorCostCenterQuery(catalog, input.costCenterQuery);
        if (resolved.status === 'NOT_FOUND') {
          return rankAdvisorPayableTitles({
            monthKey: input.monthKey,
            titleStatus: input.status,
            ordering: input.ordering,
            requestedLimit: limits.requestedLimit,
            effectiveLimit: limits.effectiveLimit,
            available: true,
            entityScope: 'COST_CENTER',
            costCenter: null,
            items: [],
            entityMiss: 'NOT_FOUND',
            entityMessage: `Centro de custo não encontrado para "${input.costCenterQuery.trim()}".`,
          });
        }
        if (resolved.status === 'AMBIGUOUS') {
          return rankAdvisorPayableTitles({
            monthKey: input.monthKey,
            titleStatus: input.status,
            ordering: input.ordering,
            requestedLimit: limits.requestedLimit,
            effectiveLimit: limits.effectiveLimit,
            available: true,
            entityScope: 'COST_CENTER',
            costCenter: null,
            items: [],
            entityMiss: 'AMBIGUOUS',
            entityMessage: 'Mais de um centro de custo corresponde à consulta.',
          });
        }
        costCenter = {
          costCenterId: resolved.center.costCenterId,
          name: resolved.center.name,
          code: resolved.center.code,
        };
        entityScope = 'COST_CENTER';
        const allocations =
          input.status === 'PAID' || input.status === 'ALL'
            ? await deps.costCenterAllocations.findRecognizedPayableAllocationsByDueDate({
                ...scope,
                costCenterId: resolved.center.costCenterId,
                from: bounds.from,
                to: bounds.to,
              })
            : await deps.costCenterAllocations.findActivePayableAllocationsByDueDate({
                ...scope,
                costCenterId: resolved.center.costCenterId,
                from: bounds.from,
                to: bounds.to,
              });
        rows = allocations.map((row) => ({
          amount: row.amount,
          installment: row.installment,
          costCenterNames: [resolved.center.name],
        }));
      } else {
        const installments =
          input.status === 'PAID' || input.status === 'ALL'
            ? await deps.payables.findRecognizedByDueDateRange({
                ...scope,
                from: bounds.from,
                to: bounds.to,
              })
            : await deps.payables.findActiveByDueDateRange({
                ...scope,
                from: bounds.from,
                to: bounds.to,
              });
        rows = installments.map((installment) => ({
          amount: installment.unpaid.greaterThan(0) ? installment.unpaid : installment.total,
          installment,
          costCenterNames: [],
        }));
      }

      const filtered = rows.filter((row) =>
        matchesTitleStatus(row.installment, input.status, today),
      );

      let available = true;
      const partyIds = filtered
        .map((row) => row.installment.partyId)
        .filter((id): id is string => id !== null);
      const categoryIds = collectCashCategoryExternalIds(
        filtered.map((row) => ({
          categoryExternalIds: row.installment.categoryExternalIds,
        })),
      );
      const [partyNames, categories] = await Promise.all([
        deps.parties.findNamesByIds(scope, partyIds),
        categoryIds.length === 0
          ? Promise.resolve([])
          : deps.categories.findByTenantAndExternalIds({
              ...scope,
              externalIds: categoryIds,
            }),
      ]);
      const categoryCatalog = new Map(categories.map((row) => [row.externalId, row]));

      const items: AdvisorPayableTitleSourceLine[] = [];
      for (const row of filtered) {
        const splitAmount = resolveRankAmount({
          row,
          status: input.status,
          today,
          hasCostCenter: entityScope === 'COST_CENTER',
        });
        if (splitAmount.kind === 'UNAVAILABLE') {
          available = false;
          continue;
        }
        if (!splitAmount.amount.greaterThan(0) && input.status !== 'PAID' && input.status !== 'ALL') {
          continue;
        }
        if (input.status === 'PAID' && !splitAmount.amount.greaterThan(0)) {
          continue;
        }
        const situation = resolveSituation(row.installment, today);
        items.push({
          externalId: row.installment.externalId,
          description: row.installment.description,
          supplierName: row.installment.partyId
            ? (partyNames.get(row.installment.partyId) ?? null)
            : null,
          categoryNames: resolvePayableCategoryNames(
            row.installment.categoryExternalIds,
            categoryCatalog,
          ),
          dueDate: row.installment.dueDate,
          rankAmount: splitAmount.amount,
          unpaid: splitAmount.unpaid,
          paid: row.installment.paid,
          total: row.installment.total,
          installmentStatus: row.installment.status,
          situation,
          costCenterNames: row.costCenterNames,
        });
      }

      return rankAdvisorPayableTitles({
        monthKey: input.monthKey,
        titleStatus: input.status,
        ordering: input.ordering,
        requestedLimit: limits.requestedLimit,
        effectiveLimit: limits.effectiveLimit,
        available,
        entityScope,
        costCenter,
        items,
      });
    },
  };
}

export function assertPayableTitlesArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly status: AdvisorPayableTitleStatus;
  readonly ordering: AdvisorPayableTitleOrdering;
  readonly limit?: number;
  readonly costCenterQuery?: string;
} {
  if ('tenantId' in raw || 'userId' in raw || 'costCenterId' in raw) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'tenantId/userId/costCenterId não são aceitos no input da tool.',
    );
  }
  const allowed = new Set(['monthKey', 'status', 'ordering', 'limit', 'costCenterQuery']);
  const extra = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'payable_titles aceita apenas monthKey, status, ordering, limit e costCenterQuery.',
    );
  }
  if (typeof raw.monthKey !== 'string' || typeof raw.status !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e status são obrigatórios.',
    );
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.monthKey.trim())) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey inválido.',
    );
  }
  if (!isAdvisorPayableTitleStatus(raw.status)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'status deve ser OPEN, PAID, OVERDUE ou ALL.',
    );
  }
  const ordering = raw.ordering === undefined ? 'VALUE_DESC' : raw.ordering;
  if (typeof ordering !== 'string' || !isAdvisorPayableTitleOrdering(ordering)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'ordering deve ser VALUE_DESC ou DUE_DATE_ASC.',
    );
  }
  const costCenterQuery =
    raw.costCenterQuery === undefined
      ? undefined
      : requireCostCenterQuery(raw.costCenterQuery);
  const limit =
    raw.limit === undefined
      ? undefined
      : requireLimit(raw.limit);
  return {
    monthKey: raw.monthKey.trim(),
    status: raw.status,
    ordering,
    ...(limit === undefined ? {} : { limit }),
    ...(costCenterQuery === undefined ? {} : { costCenterQuery }),
  };
}

export function serializePayableTitlesToolResult(
  window: AdvisorPayableTitleWindow,
): Record<string, unknown> {
  return serializeAdvisorPayableTitles(window);
}

function matchesTitleStatus(
  installment: FinancialInstallmentReadRecord,
  status: AdvisorPayableTitleStatus,
  today: Date,
): boolean {
  const isActive = (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(
    installment.status,
  );
  const unpaid = installment.unpaid.greaterThan(0);
  const paidSettled =
    installment.status === 'PAID' ||
    (!unpaid && installment.paid.greaterThan(0));

  if (status === 'OPEN') {
    return isActive && unpaid;
  }
  if (status === 'OVERDUE') {
    return isActive && unpaid && installment.dueDate.getTime() < today.getTime();
  }
  if (status === 'PAID') {
    return paidSettled;
  }
  // ALL = open unpaid + paid settled in the dueDate month universe
  return (isActive && unpaid) || paidSettled;
}

function resolveSituation(
  installment: FinancialInstallmentReadRecord,
  today: Date,
): AdvisorPayableTitleSourceLine['situation'] {
  if (
    installment.status === 'PAID' ||
    (!installment.unpaid.greaterThan(0) && installment.paid.greaterThan(0))
  ) {
    return 'PAID';
  }
  return classifyInstallmentDueSituation(installment.dueDate, today);
}

function resolveRankAmount(input: {
  readonly row: {
    readonly amount: Prisma.Decimal;
    readonly installment: FinancialInstallmentReadRecord;
  };
  readonly status: AdvisorPayableTitleStatus;
  readonly today: Date;
  readonly hasCostCenter: boolean;
}):
  | { readonly kind: 'OK'; readonly amount: Prisma.Decimal; readonly unpaid: Prisma.Decimal }
  | { readonly kind: 'UNAVAILABLE' } {
  const { installment } = input.row;
  const paidSettled =
    installment.status === 'PAID' ||
    (!installment.unpaid.greaterThan(0) && installment.paid.greaterThan(0));

  if (!input.hasCostCenter) {
    if (paidSettled) {
      const amount = installment.total.greaterThan(0) ? installment.total : installment.paid;
      return { kind: 'OK', amount, unpaid: ZERO };
    }
    return {
      kind: 'OK',
      amount: installment.unpaid,
      unpaid: installment.unpaid,
    };
  }

  const split = deriveInstallmentCostCenterCashSplit({
    allocationAmount: input.row.amount,
    installmentTotal: installment.total,
    paid: installment.paid,
    unpaid: installment.unpaid,
    dueDate: installment.dueDate,
    today: input.today,
  });
  if (split.kind === 'UNAVAILABLE') {
    return { kind: 'UNAVAILABLE' };
  }
  if (paidSettled) {
    return {
      kind: 'OK',
      amount: input.row.amount.greaterThan(0) ? input.row.amount : split.outstanding,
      unpaid: ZERO,
    };
  }
  return { kind: 'OK', amount: split.outstanding, unpaid: split.outstanding };
}

async function loadCatalog(
  costCenters: Pick<CostCenterReadRepository, 'listByTenant'>,
  tenantId: string,
): Promise<readonly AdvisorCostCenterCatalogItem[]> {
  const rows = await costCenters.listByTenant(tenantId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
  }));
}

function requireTenantId(tenantId: string): string {
  const trimmed = tenantId.trim();
  if (trimmed === '') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'tenantId de sessão inválido.',
    );
  }
  return trimmed;
}

function requireCostCenterQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'costCenterQuery deve ser texto.',
    );
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 80) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'costCenterQuery textual inválido.',
    );
  }
  return trimmed;
}

function requireLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'limit inválido.',
    );
  }
  return value;
}
