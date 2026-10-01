import {
  parseProactiveTriggerParameters,
  type ParsedProactiveParameters,
} from './proactive-trigger-catalog.js';

/** Versão do pacote que o marcador de bootstrap reconhece. */
export const PROACTIVE_TRIGGER_DEFAULT_PACKAGE_VERSION = 1;

const DEFAULT_PACKAGE_RAW = [
  ['REVENUE_GOAL_PERCENTAGE', { percentage: 80 }],
  ['REVENUE_GOAL_PERCENTAGE', { percentage: 90 }],
  ['REVENUE_GOAL_PERCENTAGE', { percentage: 100 }],
  ['EXPENSE_CEILING_PERCENTAGE', { percentage: 80 }],
  ['EXPENSE_CEILING_PERCENTAGE', { percentage: 90 }],
  ['EXPENSE_CEILING_PERCENTAGE', { percentage: 100 }],
  ['EXPENSE_CEILING_EXCEEDED', {}],
  ['TITLE_DUE_SOON', { daysAhead: 3, minimumAmount: '5000', titleKind: 'PAYABLE' }],
  ['TITLE_DUE_SOON', { daysAhead: 3, minimumAmount: '5000', titleKind: 'RECEIVABLE' }],
] as const;

/** Nove gatilhos ativos no primeiro provisionamento. Não avalia e não cria insight. */
export function proactiveTriggerDefaultPackage(): readonly ParsedProactiveParameters[] {
  return DEFAULT_PACKAGE_RAW.map(([triggerType, raw]) =>
    parseProactiveTriggerParameters(triggerType, raw),
  );
}
