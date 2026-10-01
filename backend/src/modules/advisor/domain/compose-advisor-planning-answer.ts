import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import {
  formatAdvisorFactualBrl,
  formatAdvisorFactualMonth,
  formatAdvisorFactualPercent,
} from './advisor-factual-display.js';
import { ADVISOR_PLANNING_FACT_KIND } from './load-monthly-planning-fact.js';

export function composeAdvisorPlanningAnswer(input: {
  readonly content: string;
  readonly facts: readonly Record<string, unknown>[];
}): string | null {
  const parts = input.facts
    .map((fact) => composeOne(fact))
    .filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return null;
  }
  const folded = foldAdvisorNominalText(input.content);
  const consolidated = /\bcentro(?:\s+de\s+custo)?\b/.test(folded)
    ? ' Os valores são consolidados da empresa e não mudam com o centro de custo.'
    : '';
  return `${parts.join(' ')}${consolidated}`;
}

function composeOne(fact: Record<string, unknown>): string | null {
  if (fact.factKind !== ADVISOR_PLANNING_FACT_KIND) {
    return null;
  }
  const subject = fact.subject === 'EXPENSE_CEILING' ? 'EXPENSE_CEILING' : 'REVENUE_GOAL';
  const month = typeof fact.monthKey === 'string' ? formatAdvisorFactualMonth(fact.monthKey) : null;
  const monthLabel = month ?? 'esse mês';
  const status = typeof fact.status === 'string' ? fact.status : '';
  const target = money(fact.target);
  const actual = money(fact.actual);
  const rate = percent(fact.rate);
  const remaining = money(fact.remaining);
  const exceeded = money(fact.exceeded);

  if (subject === 'REVENUE_GOAL') {
    return composeGoal({ status, monthLabel, target, actual, rate, remaining, exceeded });
  }
  return composeCeiling({ status, monthLabel, target, actual, rate, remaining, exceeded });
}

function composeGoal(input: PhraseInput): string {
  if (input.status === 'NO_TARGET') {
    return `Não há meta de faturamento definida para ${input.monthLabel}.`;
  }
  if (input.status === 'UNAVAILABLE' || input.target === null) {
    return `A meta de faturamento de ${input.monthLabel} é ${input.target ?? 'indisponível'}, mas o faturamento oficial desse mês está indisponível. Não dá para calcular percentual, falta ou excedente.`;
  }
  if (input.status === 'PLANNED') {
    return `A meta de faturamento de ${input.monthLabel} é ${input.target}. Esse mês ainda não começou, então o atingimento não é julgado.`;
  }
  if (input.actual === null || input.rate === null) {
    return `A meta de faturamento de ${input.monthLabel} é ${input.target}, mas o faturamento oficial desse mês está indisponível.`;
  }
  if (input.status === 'ACHIEVED') {
    return `A meta de faturamento de ${input.monthLabel} é ${input.target}. O faturamento foi ${input.actual}, exatamente a meta (${input.rate}).`;
  }
  if (input.status === 'EXCEEDED') {
    return `A meta de faturamento de ${input.monthLabel} é ${input.target}. O faturamento foi ${input.actual} (${input.rate}). A meta foi excedida em ${input.exceeded ?? input.actual}.`;
  }
  if (input.status === 'NOT_ACHIEVED') {
    return `A meta de faturamento de ${input.monthLabel} era ${input.target}. O faturamento foi ${input.actual} (${input.rate}). Ficou abaixo em ${input.remaining ?? input.target}.`;
  }
  return `A meta de faturamento de ${input.monthLabel} é ${input.target}. O faturamento está em ${input.actual} (${input.rate}). Faltam ${input.remaining ?? input.target} para atingir a meta.`;
}

function composeCeiling(input: PhraseInput): string {
  if (input.status === 'NO_TARGET') {
    return `Não há teto de gastos definido para ${input.monthLabel}.`;
  }
  if (input.status === 'UNAVAILABLE' || input.target === null) {
    return `O teto de gastos de ${input.monthLabel} é ${input.target ?? 'indisponível'}, mas as despesas oficiais desse mês estão indisponíveis. Não dá para calcular consumo, disponível ou excedente.`;
  }
  if (input.status === 'PLANNED') {
    return `O teto de gastos de ${input.monthLabel} é ${input.target}. Esse mês ainda não começou, então o consumo não é julgado.`;
  }
  if (input.actual === null || input.rate === null) {
    return `O teto de gastos de ${input.monthLabel} é ${input.target}, mas as despesas oficiais desse mês estão indisponíveis.`;
  }
  if (input.status === 'ACHIEVED') {
    return `O teto de gastos de ${input.monthLabel} é ${input.target}. As despesas do mês foram ${input.actual}, exatamente o teto (${input.rate}).`;
  }
  if (input.status === 'EXCEEDED') {
    return `O teto de gastos de ${input.monthLabel} é ${input.target}. As despesas do mês foram ${input.actual} (${input.rate}). O teto foi ultrapassado em ${input.exceeded ?? input.actual}.`;
  }
  if (input.status === 'CONTAINED') {
    return `O teto de gastos de ${input.monthLabel} era ${input.target}. As despesas do mês foram ${input.actual} (${input.rate}), dentro do teto. A folga foi ${input.remaining ?? input.target}.`;
  }
  return `O teto de gastos de ${input.monthLabel} é ${input.target}. As despesas do mês estão em ${input.actual} (${input.rate}). Ainda é possível gastar ${input.remaining ?? input.target}.`;
}

type PhraseInput = {
  readonly status: string;
  readonly monthLabel: string;
  readonly target: string | null;
  readonly actual: string | null;
  readonly rate: string | null;
  readonly remaining: string | null;
  readonly exceeded: string | null;
};

function money(value: unknown): string | null {
  return typeof value === 'string' ? formatAdvisorFactualBrl(value) : null;
}

function percent(value: unknown): string | null {
  return typeof value === 'string' ? formatAdvisorFactualPercent(value) : null;
}
