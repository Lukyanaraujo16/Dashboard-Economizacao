import { Prisma } from '../../../generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import {
  civilDateUtcFromKey,
  civilMonthBoundsFromKey,
  civilMonthKey,
  formatCivilDateKey,
} from '../../analytics/domain/civil-calendar.js';
import { monthlyBilling, monthlyExpenses } from '../../analytics/domain/monthly-cash-flow.js';
import { mapUpcomingInstallments } from '../../analytics/domain/upcoming.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import {
  calculateExpenseCeilingProgress,
  type ExpenseCeilingProgress,
} from '../../dashboard/domain/expense-ceiling-math.js';
import {
  calculateRevenueGoalProgress,
  type RevenueGoalProgress,
} from '../../dashboard/domain/revenue-goal-math.js';
import type { ExpenseCeilingRepository } from '../../dashboard/repositories/expense-ceiling.repository.js';
import type { RevenueGoalRepository } from '../../dashboard/repositories/revenue-goal.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import {
  proactiveTitleSubjectKey,
  qualifyExpenseCeilingExceeded,
  qualifyExpenseCeilingPercentage,
  qualifyRevenueGoal,
  titleDueWindow,
  titleQualifies,
} from '../domain/evaluate-proactive-triggers.js';
import {
  resolveProactiveTriggerSeverity,
  type ProactiveSeverity,
} from '../domain/proactive-trigger-severity.js';
import type {
  ProactiveTriggerConfigurationRecord,
  ProactiveTriggerRepository,
} from '../repositories/proactive-trigger.repository.js';
import type { ProactiveTriggerService } from './proactive-trigger.service.js';

const REVENUE_GOAL_SOURCE_METRIC = 'revenue_goal.value.month';
const EXPENSE_CEILING_SOURCE_METRIC = 'expense_ceiling.value.month';
const TITLE_DUE_SOURCE_METRIC = 'installment.due_soon';

type ProactiveFactPayload = Record<string, string | number | boolean | null>;

export type ProactiveTriggerEngineOccurrence = {
  readonly configurationId: string;
  readonly created: boolean;
  readonly eventId: string;
  readonly insightId: string;
  readonly severity: ProactiveSeverity;
};

export type ProactiveTriggerEvaluation = {
  readonly evaluated: number;
  readonly created: number;
  readonly reused: number;
  readonly occurrences: readonly ProactiveTriggerEngineOccurrence[];
};

export type ProactiveTriggerEngine = {
  evaluate(input: { readonly tenantId: string; readonly now: Date }): Promise<ProactiveTriggerEvaluation>;
};

export type ProactiveTriggerEngineDependencies = {
  readonly triggers: ProactiveTriggerRepository;
  readonly triggerService: ProactiveTriggerService;
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly revenueGoals: Pick<RevenueGoalRepository, 'findByTenantMonth'>;
  readonly expenseCeilings: Pick<ExpenseCeilingRepository, 'findByTenantMonth'>;
  readonly receivables: Pick<ReceivableReadRepository, 'findActiveByDueDateRange'>;
  readonly payables: Pick<PayableReadRepository, 'findActiveByDueDateRange'>;
  readonly parties?: Pick<PartyReadRepository, 'findOfficialLabelsByIds'>;
  readonly categories?: Pick<FinancialCategoryReadRepository, 'findByTenantAndExternalIds'>;
};

type MonthPeriod = {
  readonly periodKey: string;
  readonly subjectKey: '';
  readonly periodStart: Date;
  readonly periodEnd: Date;
};

type CurrentPlanning = {
  readonly revenue: RevenueGoalProgress | null;
  readonly expense: ExpenseCeilingProgress | null;
};

/**
 * Motor determinístico da F14.2.
 * Lê o estado atual do mês civil corrente e registra ocorrência pela configuração ativa.
 * Não narra, não chama modelo e não varre histórico.
 */
export function createProactiveTriggerEngine(
  deps: ProactiveTriggerEngineDependencies,
): ProactiveTriggerEngine {
  return {
    async evaluate(input) {
      const configurations = await deps.triggers.listByTenant(input.tenantId);
      const active = configurations.filter((configuration) => configuration.active);
      const today = civilTodayInSaoPaulo(input.now);
      const monthKey = civilMonthKey(today);
      const bounds = civilMonthBoundsFromKey(monthKey);
      const monthPeriod: MonthPeriod = {
        periodKey: monthKey,
        subjectKey: '',
        periodStart: bounds.from,
        periodEnd: bounds.to,
      };
      const needsRevenue = active.some(
        (configuration) => configuration.triggerType === 'REVENUE_GOAL_PERCENTAGE',
      );
      const needsExpense = active.some(
        (configuration) =>
          configuration.triggerType === 'EXPENSE_CEILING_PERCENTAGE' ||
          configuration.triggerType === 'EXPENSE_CEILING_EXCEEDED',
      );
      const planning = await loadCurrentPlanning(
        deps,
        input.tenantId,
        input.now,
        monthKey,
        needsRevenue,
        needsExpense,
      );
      const occurrences: ProactiveTriggerEngineOccurrence[] = [];

      const record = async (
        configuration: ProactiveTriggerConfigurationRecord,
        period: {
          readonly periodKey: string;
          readonly subjectKey: string;
          readonly periodStart: Date;
          readonly periodEnd: Date;
        },
        sourceMetric: string,
        payload: ProactiveFactPayload,
      ): Promise<void> => {
        const severity = resolveProactiveTriggerSeverity(
          configuration.triggerType,
          configuration.percentage,
        );
        const recorded = await deps.triggerService.recordOccurrence({
          tenantId: input.tenantId,
          configurationId: configuration.id,
          periodKey: period.periodKey,
          subjectKey: period.subjectKey,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          sourceMetric,
          payload,
          detectedAt: input.now,
          severity,
        });
        occurrences.push({
          configurationId: configuration.id,
          created: recorded.created,
          eventId: recorded.eventId,
          insightId: recorded.insightId,
          severity,
        });
      };

      const recordRevenue = async (
        configuration: ProactiveTriggerConfigurationRecord,
      ): Promise<void> => {
        const percentage = configuration.percentage;
        const progress = planning.revenue;
        if (percentage === null || progress === null || !qualifyRevenueGoal(progress, percentage)) {
          return;
        }
        await record(
          configuration,
          monthPeriod,
          REVENUE_GOAL_SOURCE_METRIC,
          revenuePayload(progress, percentage),
        );
      };

      const recordExpensePercentage = async (
        configuration: ProactiveTriggerConfigurationRecord,
      ): Promise<void> => {
        const percentage = configuration.percentage;
        const progress = planning.expense;
        if (
          percentage === null ||
          progress === null ||
          !qualifyExpenseCeilingPercentage(progress, percentage)
        ) {
          return;
        }
        await record(
          configuration,
          monthPeriod,
          EXPENSE_CEILING_SOURCE_METRIC,
          expensePercentagePayload(progress, percentage),
        );
      };

      const recordExpenseExceeded = async (
        configuration: ProactiveTriggerConfigurationRecord,
      ): Promise<void> => {
        const progress = planning.expense;
        if (progress === null || !qualifyExpenseCeilingExceeded(progress)) {
          return;
        }
        await record(
          configuration,
          monthPeriod,
          EXPENSE_CEILING_SOURCE_METRIC,
          expenseExceededPayload(progress),
        );
      };

      const recordDueTitles = async (
        configuration: ProactiveTriggerConfigurationRecord,
      ): Promise<void> => {
        const { daysAhead, minimumAmount, titleKind } = configuration;
        if (daysAhead === null || minimumAmount === null || titleKind === null) {
          return;
        }
        const window = titleDueWindow(input.now, daysAhead);
        if (window === null) {
          return;
        }
        const query = { tenantId: input.tenantId, from: window.from, to: window.to };
        const records =
          titleKind === 'RECEIVABLE'
            ? await deps.receivables.findActiveByDueDateRange(query)
            : await deps.payables.findActiveByDueDateRange(query);
        const byId = new Map(records.map((row) => [row.id, row]));
        const partyIds = records.flatMap((row) => (row.partyId ? [row.partyId] : []));
        const labels = deps.parties
          ? await deps.parties.findOfficialLabelsByIds({ tenantId: input.tenantId }, partyIds)
          : new Map();
        const categoryRows = deps.categories
          ? await deps.categories.findByTenantAndExternalIds({
              tenantId: input.tenantId,
              externalIds: records.flatMap((row) => [...row.categoryExternalIds]),
            })
          : [];
        const categoryNames = new Map(
          categoryRows.map((row) => [row.externalId, row.name.trim()] as const),
        );
        for (const item of mapUpcomingInstallments(records)) {
          const source = byId.get(item.id);
          if (!source || !titleQualifies(item.unpaid, minimumAmount, item.dueDate, window)) {
            continue;
          }
          const subjectKey = proactiveTitleSubjectKey(titleKind, source.externalId);
          if (subjectKey === null) {
            continue;
          }
          const dueKey = formatCivilDateKey(item.dueDate);
          const dueDay = civilDateUtcFromKey(dueKey);
          if (dueDay === null) {
            continue;
          }
          const description = source.description?.trim() ?? '';
          const label = source.partyId ? labels.get(source.partyId) : undefined;
          const counterpartyName = label?.name.trim() ?? '';
          const documentNumber = label?.document?.trim() ?? '';
          const categoryName =
            source.categoryExternalIds
              .map((externalId) => categoryNames.get(externalId) ?? '')
              .find((name) => name.length > 0) ?? '';
          await record(
            configuration,
            {
              periodKey: dueKey,
              subjectKey,
              periodStart: dueDay,
              periodEnd: dueDay,
            },
            TITLE_DUE_SOURCE_METRIC,
            {
              titleKind,
              externalId: source.externalId,
              dueDate: dueKey,
              unpaid: item.unpaid.toString(),
              minimumAmount,
              daysAhead,
              status: item.status,
              ...(description.length > 0 ? { description } : {}),
              ...(counterpartyName.length > 0 ? { counterpartyName } : {}),
              ...(documentNumber.length > 0 ? { documentNumber } : {}),
              ...(categoryName.length > 0 ? { categoryName } : {}),
            },
          );
        }
      };

      for (const configuration of active) {
        switch (configuration.triggerType) {
          case 'REVENUE_GOAL_PERCENTAGE':
            await recordRevenue(configuration);
            break;
          case 'EXPENSE_CEILING_PERCENTAGE':
            await recordExpensePercentage(configuration);
            break;
          case 'EXPENSE_CEILING_EXCEEDED':
            await recordExpenseExceeded(configuration);
            break;
          case 'TITLE_DUE_SOON':
            await recordDueTitles(configuration);
            break;
          default: {
            const unexpected: never = configuration.triggerType;
            throw new AdvisorDomainError(
              'TRIGGER_TYPE_UNKNOWN',
              `Tipo não certificado: ${unexpected}`,
            );
          }
        }
      }

      return {
        evaluated: active.length,
        created: occurrences.filter((occurrence) => occurrence.created).length,
        reused: occurrences.filter((occurrence) => !occurrence.created).length,
        occurrences,
      };
    },
  };
}

async function loadCurrentPlanning(
  deps: ProactiveTriggerEngineDependencies,
  tenantId: string,
  now: Date,
  monthKey: string,
  needsRevenue: boolean,
  needsExpense: boolean,
): Promise<CurrentPlanning> {
  if (!needsRevenue && !needsExpense) {
    return { revenue: null, expense: null };
  }
  const flow = await deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now });
  let revenue: RevenueGoalProgress | null = null;
  if (needsRevenue) {
    const row = await deps.revenueGoals.findByTenantMonth(tenantId, monthKey);
    const billing = monthlyBilling(flow);
    if (row !== null && billing !== null) {
      revenue = calculateRevenueGoalProgress({
        monthKey,
        target: row.targetAmount,
        actual: billing,
        referenceMonthKey: monthKey,
      });
    }
  }
  let expense: ExpenseCeilingProgress | null = null;
  if (needsExpense) {
    const row = await deps.expenseCeilings.findByTenantMonth(tenantId, monthKey);
    expense = calculateExpenseCeilingProgress({
      monthKey,
      ceiling: row?.ceilingAmount ?? null,
      monthlyExpenses: monthlyExpenses(flow),
      referenceMonthKey: monthKey,
    });
  }
  return { revenue, expense };
}

function money(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

function revenuePayload(progress: RevenueGoalProgress, percentage: number): ProactiveFactPayload {
  return {
    monthKey: progress.monthKey,
    threshold: percentage,
    target: money(progress.target),
    actual: progress.actual.toString(),
    rate: money(progress.achievementRate),
    remaining: money(progress.remaining),
    exceeded: money(progress.exceeded),
    status: progress.status,
  };
}

function expensePercentagePayload(
  progress: ExpenseCeilingProgress,
  percentage: number,
): ProactiveFactPayload {
  return {
    monthKey: progress.monthKey,
    threshold: percentage,
    ceiling: money(progress.ceiling),
    expenses: money(progress.monthlyExpenses),
    rate: money(progress.consumedRate),
    remaining: money(progress.available),
    exceeded: money(progress.exceeded),
    status: progress.status,
  };
}

function expenseExceededPayload(progress: ExpenseCeilingProgress): ProactiveFactPayload {
  return {
    monthKey: progress.monthKey,
    ceiling: money(progress.ceiling),
    expenses: money(progress.monthlyExpenses),
    rate: money(progress.consumedRate),
    exceeded: money(progress.exceeded),
    status: progress.status,
  };
}
