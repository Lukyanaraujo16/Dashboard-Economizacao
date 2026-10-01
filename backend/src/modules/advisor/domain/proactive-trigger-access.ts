import { AdvisorDomainError } from './advisor-domain-error.js';

export type ProactiveActor = {
  readonly role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  readonly supportSession: boolean;
};

export function assertCanAdministerProactiveTriggers(actor: ProactiveActor): void {
  if (actor.supportSession) {
    throw new AdvisorDomainError(
      'SUPPORT_CANNOT_ADMINISTER_TRIGGERS',
      'Modo suporte não altera gatilho do cliente.',
    );
  }
  if (actor.role === 'USER') {
    throw new AdvisorDomainError(
      'TRIGGER_ADMIN_FORBIDDEN',
      'Usuário da empresa não administra gatilhos.',
    );
  }
}

export function assertCanMarkInsightRead(actor: ProactiveActor): void {
  if (actor.supportSession) {
    throw new AdvisorDomainError(
      'SUPPORT_CANNOT_MARK_INSIGHT_READ',
      'Modo suporte não marca insight como lido para o cliente.',
    );
  }
}
