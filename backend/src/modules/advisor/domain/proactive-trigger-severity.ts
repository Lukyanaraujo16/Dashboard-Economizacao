import { AdvisorDomainError } from './advisor-domain-error.js';
import type { ProactiveTriggerType } from './proactive-trigger-catalog.js';

/**
 * Severidade certificada da V1.
 * Pertence ao tipo e, no teto percentual, ao marco configurado.
 * O administrador não escolhe severidade.
 */
export const PROACTIVE_SEVERITIES = ['INFORMATIVE', 'ATTENTION', 'IMPORTANT', 'CRITICAL'] as const;

export type ProactiveSeverity = (typeof PROACTIVE_SEVERITIES)[number];

export function resolveProactiveTriggerSeverity(
  triggerType: ProactiveTriggerType,
  percentage: number | null,
): ProactiveSeverity {
  switch (triggerType) {
    case 'REVENUE_GOAL_PERCENTAGE':
      return 'INFORMATIVE';
    case 'EXPENSE_CEILING_PERCENTAGE':
      if (percentage === null) {
        throw new AdvisorDomainError(
          'TRIGGER_PERCENTAGE_INVALID',
          'Marco percentual sem percentual configurado.',
        );
      }
      return percentage < 90 ? 'ATTENTION' : 'IMPORTANT';
    case 'EXPENSE_CEILING_EXCEEDED':
      return 'CRITICAL';
    case 'TITLE_DUE_SOON':
      return 'ATTENTION';
    default: {
      const unexpected: never = triggerType;
      throw new AdvisorDomainError('TRIGGER_TYPE_UNKNOWN', `Tipo não certificado: ${unexpected}`);
    }
  }
}
