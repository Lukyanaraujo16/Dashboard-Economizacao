import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import {
  assertCanAdministerProactiveTriggers,
  assertCanMarkInsightRead,
  type ProactiveActor,
} from '../domain/proactive-trigger-access.js';
import {
  assertProactivePayload,
  assertProactivePeriodKey,
  assertProactiveSourceMetric,
  assertProactiveSubjectKey,
  CERTIFIED_PROACTIVE_TRIGGER_TYPES,
  parseProactiveTriggerParameters,
  PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS,
  type CertifiedProactiveTriggerType,
} from '../domain/proactive-trigger-catalog.js';
import type { ProactiveSeverity } from '../domain/proactive-trigger-severity.js';
import type {
  ProactiveTriggerConfigurationRecord,
  ProactiveTriggerRepository,
  RecordedProactiveOccurrence,
} from '../repositories/proactive-trigger.repository.js';

export type ProactiveTriggerService = {
  listCertifiedTypes(): readonly CertifiedProactiveTriggerType[];
  suggestedDefaults(): typeof PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS;
  listConfigurations(
    actor: ProactiveActor,
    tenantId: string,
  ): Promise<ProactiveTriggerConfigurationRecord[]>;
  createConfiguration(
    actor: ProactiveActor,
    tenantId: string,
    triggerType: string,
    parameters: unknown,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  updateConfiguration(
    actor: ProactiveActor,
    tenantId: string,
    configurationId: string,
    parameters: unknown,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  setConfigurationActive(
    actor: ProactiveActor,
    tenantId: string,
    configurationId: string,
    active: boolean,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  deleteConfiguration(
    actor: ProactiveActor,
    tenantId: string,
    configurationId: string,
  ): Promise<void>;
  recordOccurrence(input: {
    readonly tenantId: string;
    readonly configurationId: string;
    readonly periodKey: string;
    readonly subjectKey: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly sourceMetric: string;
    readonly payload: unknown;
    readonly detectedAt: Date;
    readonly severity?: ProactiveSeverity | null;
  }): Promise<RecordedProactiveOccurrence>;
  markInsightRead(
    actor: ProactiveActor,
    input: {
      readonly tenantId: string;
      readonly insightId: string;
      readonly userId: string;
      readonly readAt: Date;
    },
  ): Promise<{ readonly readAt: Date }>;
};

export function createProactiveTriggerService(
  repository: ProactiveTriggerRepository,
): ProactiveTriggerService {
  return {
    listCertifiedTypes() {
      return CERTIFIED_PROACTIVE_TRIGGER_TYPES;
    },

    suggestedDefaults() {
      return PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS;
    },

    async listConfigurations(actor, tenantId) {
      assertCanAdministerProactiveTriggers(actor);
      return repository.listByTenant(tenantId);
    },

    async createConfiguration(actor, tenantId, triggerType, parameters) {
      assertCanAdministerProactiveTriggers(actor);
      return repository.create(tenantId, parseProactiveTriggerParameters(triggerType, parameters));
    },

    async updateConfiguration(actor, tenantId, configurationId, parameters) {
      assertCanAdministerProactiveTriggers(actor);
      const configuration = await repository.findByTenantAndId(tenantId, configurationId);
      if (!configuration) {
        throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
      }
      return repository.updateParameters(
        tenantId,
        configurationId,
        parseProactiveTriggerParameters(configuration.triggerType, parameters),
      );
    },

    async setConfigurationActive(actor, tenantId, configurationId, active) {
      assertCanAdministerProactiveTriggers(actor);
      return repository.setActive(tenantId, configurationId, active);
    },

    async deleteConfiguration(actor, tenantId, configurationId) {
      assertCanAdministerProactiveTriggers(actor);
      await repository.deleteIfNoHistory(tenantId, configurationId);
    },

    async recordOccurrence(input) {
      const configuration = await repository.findByTenantAndId(
        input.tenantId,
        input.configurationId,
      );
      if (!configuration) {
        throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
      }
      assertProactivePeriodKey(configuration.triggerType, input.periodKey);
      assertProactiveSubjectKey(configuration.triggerType, input.subjectKey, configuration.titleKind);
      assertProactiveSourceMetric(input.sourceMetric);
      const payload = assertProactivePayload(input.payload);
      if (input.periodEnd.getTime() < input.periodStart.getTime()) {
        throw new AdvisorDomainError('TRIGGER_PERIOD_INVALID', 'O fim do período antecede o início.');
      }
      return repository.recordOccurrence({
        tenantId: input.tenantId,
        configurationId: input.configurationId,
        periodKey: input.periodKey,
        subjectKey: input.subjectKey,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sourceMetric: input.sourceMetric,
        payload,
        detectedAt: input.detectedAt,
        severity: input.severity ?? null,
      });
    },

    async markInsightRead(actor, input) {
      assertCanMarkInsightRead(actor);
      return repository.markRead(input);
    },
  };
}
