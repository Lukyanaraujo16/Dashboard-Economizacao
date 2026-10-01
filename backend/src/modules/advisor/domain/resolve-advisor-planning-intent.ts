import { foldAdvisorNominalText } from './advisor-nominal-text.js';

export const ADVISOR_PLANNING_SUBJECTS = ['REVENUE_GOAL', 'EXPENSE_CEILING'] as const;
export type AdvisorPlanningSubject = (typeof ADVISOR_PLANNING_SUBJECTS)[number];

export type AdvisorPlanningIntent = {
  readonly subjects: readonly AdvisorPlanningSubject[];
};

/**
 * Perguntas de meta de faturamento e teto de gastos.
 * Não publica capability e não lê centro de custo.
 */
export function resolveAdvisorPlanningIntent(content: string): AdvisorPlanningIntent | null {
  const folded = foldAdvisorNominalText(content);
  const wantsGoal = /\bmetas?\b/.test(folded);
  const wantsCeiling =
    /\bteto\b/.test(folded) ||
    /\bposso gastar\b/.test(folded) ||
    /\bquanto (?:eu )?ja gastei\b/.test(folded) ||
    /\bquanto gastei\b/.test(folded);
  if (!wantsGoal && !wantsCeiling) {
    return null;
  }
  if (
    !wantsGoal &&
    !/\bteto\b/.test(folded) &&
    /\b(?:fornecedores?|categorias?|convenios?)\b/.test(folded)
  ) {
    return null;
  }
  const subjects: AdvisorPlanningSubject[] = [];
  if (wantsGoal) {
    subjects.push('REVENUE_GOAL');
  }
  if (wantsCeiling) {
    subjects.push('EXPENSE_CEILING');
  }
  return { subjects };
}
