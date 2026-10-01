import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { formatCivilDateKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { mapUpcomingInstallments } from '../src/modules/analytics/domain/upcoming.js';
import { calculateExpenseCeilingProgress } from '../src/modules/dashboard/domain/expense-ceiling-math.js';
import { calculateRevenueGoalProgress } from '../src/modules/dashboard/domain/revenue-goal-math.js';
import {
  proactiveTitleSubjectKey,
  qualifyExpenseCeilingExceeded,
  qualifyExpenseCeilingPercentage,
  qualifyRevenueGoal,
  titleDueWindow,
  titleQualifies,
} from '../src/modules/advisor/domain/evaluate-proactive-triggers.js';
import { resolveProactiveTriggerSeverity } from '../src/modules/advisor/domain/proactive-trigger-severity.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');
const CURRENT_MONTH = '2026-10';

function revenueProgress(input: {
  readonly target: string | null;
  readonly actual: string;
  readonly monthKey?: string;
}) {
  return calculateRevenueGoalProgress({
    monthKey: input.monthKey ?? CURRENT_MONTH,
    target: input.target === null ? null : new Prisma.Decimal(input.target),
    actual: new Prisma.Decimal(input.actual),
    referenceMonthKey: CURRENT_MONTH,
  });
}

function expenseProgress(input: {
  readonly ceiling: string | null;
  readonly expenses: string | null;
  readonly monthKey?: string;
}) {
  return calculateExpenseCeilingProgress({
    monthKey: input.monthKey ?? CURRENT_MONTH,
    ceiling: input.ceiling === null ? null : new Prisma.Decimal(input.ceiling),
    monthlyExpenses: input.expenses === null ? null : new Prisma.Decimal(input.expenses),
    referenceMonthKey: CURRENT_MONTH,
  });
}

function civil(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function installment(
  input: Pick<FinancialInstallmentReadRecord, 'id' | 'externalId' | 'unpaid' | 'dueDate'>,
): FinancialInstallmentReadRecord {
  return {
    id: input.id,
    tenantId: 'tenant',
    integrationId: 'integration',
    externalId: input.externalId,
    description: 'nao-decide',
    dueDate: input.dueDate,
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'OPEN',
    upstreamStatus: null,
    total: input.unpaid,
    paid: new Prisma.Decimal(0),
    unpaid: input.unpaid,
    partyId: 'pessoa',
    categoryExternalIds: ['categoria'],
    syncedAt: NOW,
  };
}

describe('qualificação da meta de faturamento', () => {
  it('não qualifica meta ausente nem taxa nula', () => {
    const missing = revenueProgress({ target: null, actual: '9200' });
    expect(missing.status).toBe('NO_TARGET');
    expect(missing.achievementRate).toBeNull();
    expect(qualifyRevenueGoal(missing, 80)).toBe(false);

    const rated = revenueProgress({ target: '10000', actual: '9200' });
    expect(qualifyRevenueGoal({ ...rated, achievementRate: null }, 80)).toBe(false);
  });

  it('qualifica igual e acima do percentual e recusa abaixo', () => {
    const below = revenueProgress({ target: '100', actual: '79' });
    const equal = revenueProgress({ target: '100', actual: '80' });
    const above = revenueProgress({ target: '100', actual: '92' });
    expect(below.status).toBe('IN_PROGRESS');
    expect(equal.achievementRate?.equals(80)).toBe(true);
    expect(above.achievementRate?.equals(92)).toBe(true);
    expect(qualifyRevenueGoal(below, 80)).toBe(false);
    expect(qualifyRevenueGoal(equal, 80)).toBe(true);
    expect(qualifyRevenueGoal(above, 80)).toBe(true);
  });

  it('trata 80, 90 e 100 como marcos independentes no mesmo progresso de 92', () => {
    const progress = revenueProgress({ target: '10000', actual: '9200' });
    expect(progress.achievementRate?.equals(92)).toBe(true);
    expect(qualifyRevenueGoal(progress, 80)).toBe(true);
    expect(qualifyRevenueGoal(progress, 90)).toBe(true);
    expect(qualifyRevenueGoal(progress, 100)).toBe(false);
  });

  it('qualifica o salto pelo estado atual, sem precisar do valor anterior', () => {
    const landed = revenueProgress({ target: '100', actual: '92' });
    expect(qualifyRevenueGoal(landed, 80)).toBe(true);
    expect(qualifyRevenueGoal(landed, 90)).toBe(true);
    expect(qualifyRevenueGoal(landed, 100)).toBe(false);
  });

  it('recusa mês futuro mesmo com taxa acima do marco', () => {
    const planned = revenueProgress({ target: '100', actual: '100', monthKey: '2026-11' });
    expect(planned.status).toBe('PLANNED');
    expect(planned.achievementRate?.equals(100)).toBe(true);
    expect(qualifyRevenueGoal(planned, 80)).toBe(false);
  });

  it('marca qualquer percentual de meta como informativo', () => {
    for (const percentage of [80, 90, 100]) {
      expect(resolveProactiveTriggerSeverity('REVENUE_GOAL_PERCENTAGE', percentage)).toBe(
        'INFORMATIVE',
      );
    }
  });
});

describe('qualificação do teto de gastos', () => {
  it('não qualifica teto ausente nem despesa indisponível', () => {
    const missing = expenseProgress({ ceiling: null, expenses: '9200' });
    expect(missing.status).toBe('NO_TARGET');
    expect(qualifyExpenseCeilingPercentage(missing, 80)).toBe(false);
    expect(qualifyExpenseCeilingExceeded(missing)).toBe(false);

    const unavailable = expenseProgress({ ceiling: '10000', expenses: null });
    expect(unavailable.status).toBe('UNAVAILABLE');
    expect(unavailable.consumedRate).toBeNull();
    expect(qualifyExpenseCeilingPercentage(unavailable, 80)).toBe(false);
    expect(qualifyExpenseCeilingExceeded(unavailable)).toBe(false);
  });

  it('qualifica igual e acima do percentual e recusa abaixo', () => {
    const below = expenseProgress({ ceiling: '100', expenses: '79' });
    const equal = expenseProgress({ ceiling: '100', expenses: '80' });
    const above = expenseProgress({ ceiling: '100', expenses: '92' });
    expect(equal.consumedRate?.equals(80)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(below, 80)).toBe(false);
    expect(qualifyExpenseCeilingPercentage(equal, 80)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(above, 80)).toBe(true);
  });

  it('separa o marco de 100% do estouro', () => {
    const exact = expenseProgress({ ceiling: '100', expenses: '100' });
    expect(exact.status).toBe('ACHIEVED');
    expect(exact.consumedRate?.equals(100)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(exact, 100)).toBe(true);
    expect(qualifyExpenseCeilingExceeded(exact)).toBe(false);

    const over = expenseProgress({ ceiling: '100', expenses: '100.01' });
    expect(over.status).toBe('EXCEEDED');
    expect(qualifyExpenseCeilingPercentage(over, 100)).toBe(true);
    expect(qualifyExpenseCeilingExceeded(over)).toBe(true);
    expect(qualifyExpenseCeilingExceeded(expenseProgress({ ceiling: '100', expenses: '92' }))).toBe(
      false,
    );
  });

  it('avalia cada percentual no mesmo progresso', () => {
    const progress = expenseProgress({ ceiling: '10000', expenses: '9200' });
    expect(progress.consumedRate?.equals(92)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(progress, 80)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(progress, 90)).toBe(true);
    expect(qualifyExpenseCeilingPercentage(progress, 100)).toBe(false);
    expect(qualifyExpenseCeilingExceeded(progress)).toBe(false);
  });

  it('recusa mês futuro', () => {
    const planned = expenseProgress({ ceiling: '100', expenses: '150', monthKey: '2026-11' });
    expect(planned.status).toBe('PLANNED');
    expect(planned.consumedRate).toBeNull();
    expect(qualifyExpenseCeilingPercentage(planned, 80)).toBe(false);
    expect(qualifyExpenseCeilingExceeded(planned)).toBe(false);
  });

  it('deriva a severidade do marco configurado', () => {
    expect(resolveProactiveTriggerSeverity('EXPENSE_CEILING_PERCENTAGE', 80)).toBe('ATTENTION');
    expect(resolveProactiveTriggerSeverity('EXPENSE_CEILING_PERCENTAGE', 90)).toBe('IMPORTANT');
    expect(resolveProactiveTriggerSeverity('EXPENSE_CEILING_PERCENTAGE', 100)).toBe('IMPORTANT');
    expect(resolveProactiveTriggerSeverity('EXPENSE_CEILING_EXCEEDED', null)).toBe('CRITICAL');
  });
});

describe('qualificação de título a vencer', () => {
  it('ancora o dia civil em America/Sao_Paulo', () => {
    expect(formatCivilDateKey(civilTodayInSaoPaulo(NOW))).toBe('2026-10-15');
  });

  it('compara o em aberto com o mínimo e inclui o dia de hoje e o fim da janela', () => {
    const window = titleDueWindow(NOW, 3);
    expect(window).not.toBeNull();
    expect(formatCivilDateKey(window!.from)).toBe('2026-10-15');
    expect(formatCivilDateKey(window!.to)).toBe('2026-10-18');
    const minimum = '5000.0000';
    expect(titleQualifies(new Prisma.Decimal('4999.9999'), minimum, civil('2026-10-16'), window)).toBe(
      false,
    );
    expect(titleQualifies(new Prisma.Decimal('5000'), minimum, civil('2026-10-16'), window)).toBe(
      true,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-15'), window)).toBe(
      true,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-17'), window)).toBe(
      true,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-18'), window)).toBe(
      true,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-14'), window)).toBe(
      false,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-19'), window)).toBe(
      false,
    );
    expect(titleQualifies(new Prisma.Decimal('6000'), minimum, civil('2026-10-16'), null)).toBe(
      false,
    );
  });

  it('corta a janela no fim do mês atual mesmo com daysAhead longo', () => {
    const window = titleDueWindow(NOW, 40);
    expect(formatCivilDateKey(window!.from)).toBe('2026-10-15');
    expect(formatCivilDateKey(window!.to)).toBe('2026-10-31');
    const unpaid = new Prisma.Decimal('9000');
    expect(titleQualifies(unpaid, '5000.0000', civil('2026-10-31'), window)).toBe(true);
    expect(titleQualifies(unpaid, '5000.0000', civil('2026-11-01'), window)).toBe(false);
    expect(titleDueWindow(NOW, -1)).toBeNull();
  });

  it('descarta unpaid zero antes da decisão de mínimo', () => {
    const open = installment({
      id: 'aberto',
      externalId: 'titulo-aberto',
      unpaid: new Prisma.Decimal('10'),
      dueDate: civil('2026-10-16'),
    });
    const paid = installment({
      id: 'pago',
      externalId: 'titulo-pago',
      unpaid: new Prisma.Decimal(0),
      dueDate: civil('2026-10-16'),
    });
    const upcoming = mapUpcomingInstallments([paid, open]);
    expect(upcoming.map((item) => item.id)).toEqual(['aberto']);
  });

  it('distingue kind e recusa externalId fora do contrato', () => {
    expect(proactiveTitleSubjectKey('PAYABLE', 'titulo-a')).toBe('PAYABLE:titulo-a');
    expect(proactiveTitleSubjectKey('RECEIVABLE', 'titulo-a')).toBe('RECEIVABLE:titulo-a');
    expect(proactiveTitleSubjectKey('PAYABLE', 'titulo a')).toBeNull();
    expect(proactiveTitleSubjectKey('PAYABLE', '')).toBeNull();
    expect(proactiveTitleSubjectKey('RECEIVABLE', 'a'.repeat(129))).toBeNull();
    expect(resolveProactiveTriggerSeverity('TITLE_DUE_SOON', null)).toBe('ATTENTION');
  });
});
