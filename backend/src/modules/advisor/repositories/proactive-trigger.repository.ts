import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import {
  buildProactiveOccurrenceKey,
  type ParsedProactiveParameters,
  type ProactiveTriggerType,
} from '../domain/proactive-trigger-catalog.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

export type ProactiveTriggerConfigurationRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly triggerType: ProactiveTriggerType;
  readonly parameterKey: string;
  readonly percentage: number | null;
  readonly daysAhead: number | null;
  readonly minimumAmount: string | null;
  readonly titleKind: 'RECEIVABLE' | 'PAYABLE' | null;
  readonly active: boolean;
};

export type RecordedProactiveOccurrence = {
  readonly created: boolean;
  readonly eventId: string;
  readonly insightId: string;
  readonly occurrenceKey: string;
  readonly parameterKey: string;
  readonly narrationStatus: 'AWAITING_NARRATION' | 'NARRATED' | 'NARRATION_FAILED';
  readonly content: string | null;
};

type ConfigurationRow = {
  id: string;
  tenantId: string;
  triggerType: ProactiveTriggerType;
  parameterKey: string;
  percentage: number | null;
  daysAhead: number | null;
  minimumAmount: Prisma.Decimal | null;
  titleKind: 'RECEIVABLE' | 'PAYABLE' | null;
  active: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toConfiguration(row: ConfigurationRow): ProactiveTriggerConfigurationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    triggerType: row.triggerType,
    parameterKey: row.parameterKey,
    percentage: row.percentage,
    daysAhead: row.daysAhead,
    minimumAmount: row.minimumAmount?.toFixed(4) ?? null,
    titleKind: row.titleKind,
    active: row.active,
  };
}

function parameterData(parsed: ParsedProactiveParameters) {
  return {
    triggerType: parsed.triggerType,
    parameterKey: parsed.parameterKey,
    percentage: parsed.percentage,
    daysAhead: parsed.daysAhead,
    minimumAmount: parsed.minimumAmount === null ? null : new Prisma.Decimal(parsed.minimumAmount),
    titleKind: parsed.titleKind,
  };
}

export type ProactiveTriggerRepository = {
  listByTenant(tenantId: string): Promise<ProactiveTriggerConfigurationRecord[]>;
  findByTenantAndId(
    tenantId: string,
    configurationId: string,
  ): Promise<ProactiveTriggerConfigurationRecord | null>;
  create(
    tenantId: string,
    parsed: ParsedProactiveParameters,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  updateParameters(
    tenantId: string,
    configurationId: string,
    parsed: ParsedProactiveParameters,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  setActive(
    tenantId: string,
    configurationId: string,
    active: boolean,
  ): Promise<ProactiveTriggerConfigurationRecord>;
  deleteIfNoHistory(tenantId: string, configurationId: string): Promise<void>;
  recordOccurrence(input: {
    readonly tenantId: string;
    readonly configurationId: string;
    readonly periodKey: string;
    readonly subjectKey: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly sourceMetric: string;
    readonly payload: Record<string, unknown>;
    readonly detectedAt: Date;
  }): Promise<RecordedProactiveOccurrence>;
  markRead(input: {
    readonly tenantId: string;
    readonly insightId: string;
    readonly userId: string;
    readonly readAt: Date;
  }): Promise<{ readonly readAt: Date }>;
};

export function createProactiveTriggerRepository(prisma: PrismaClient): ProactiveTriggerRepository {
  return {
    async listByTenant(tenantId) {
      assertAdvisorTenantId(tenantId);
      const rows = await prisma.proactiveTriggerConfiguration.findMany({
        where: { tenantId },
        orderBy: [{ triggerType: 'asc' }, { parameterKey: 'asc' }],
      });
      return rows.map(toConfiguration);
    },

    async findByTenantAndId(tenantId, configurationId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.proactiveTriggerConfiguration.findFirst({
        where: { id: configurationId, tenantId },
      });
      return row ? toConfiguration(row) : null;
    },

    async create(tenantId, parsed) {
      assertAdvisorTenantId(tenantId);
      try {
        const row = await prisma.proactiveTriggerConfiguration.create({
          data: { tenantId, active: true, ...parameterData(parsed) },
        });
        return toConfiguration(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AdvisorDomainError(
            'TRIGGER_CONFIGURATION_DUPLICATE',
            'Esta configuração já existe neste tenant.',
          );
        }
        throw error;
      }
    },

    async updateParameters(tenantId, configurationId, parsed) {
      assertAdvisorTenantId(tenantId);
      const current = await prisma.proactiveTriggerConfiguration.findFirst({
        where: { id: configurationId, tenantId },
      });
      if (!current) {
        throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
      }
      if (current.triggerType !== parsed.triggerType) {
        throw new AdvisorDomainError(
          'TRIGGER_TYPE_IMMUTABLE',
          'O tipo certificado de uma configuração não muda.',
        );
      }
      try {
        const row = await prisma.proactiveTriggerConfiguration.update({
          where: { id: current.id },
          data: parameterData(parsed),
        });
        return toConfiguration(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AdvisorDomainError(
            'TRIGGER_CONFIGURATION_DUPLICATE',
            'Esta configuração já existe neste tenant.',
          );
        }
        throw error;
      }
    },

    async setActive(tenantId, configurationId, active) {
      assertAdvisorTenantId(tenantId);
      const current = await prisma.proactiveTriggerConfiguration.findFirst({
        where: { id: configurationId, tenantId },
      });
      if (!current) {
        throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
      }
      const row = await prisma.proactiveTriggerConfiguration.update({
        where: { id: current.id },
        data: { active },
      });
      return toConfiguration(row);
    },

    async deleteIfNoHistory(tenantId, configurationId) {
      assertAdvisorTenantId(tenantId);
      const current = await prisma.proactiveTriggerConfiguration.findFirst({
        where: { id: configurationId, tenantId },
      });
      if (!current) {
        throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
      }
      const events = await prisma.analyticalEvent.count({
        where: { tenantId, triggerConfigurationId: current.id },
      });
      if (events > 0) {
        throw new AdvisorDomainError(
          'TRIGGER_CONFIGURATION_HAS_HISTORY',
          'Configuração com evento histórico só pode ser desativada.',
        );
      }
      await prisma.proactiveTriggerConfiguration.delete({ where: { id: current.id } });
    },

    async recordOccurrence(input) {
      assertAdvisorTenantId(input.tenantId);
      return prisma.$transaction(async (tx) => {
        const configuration = await tx.proactiveTriggerConfiguration.findFirst({
          where: { id: input.configurationId, tenantId: input.tenantId },
        });
        if (!configuration) {
          throw new AdvisorDomainError('TRIGGER_CONFIGURATION_NOT_FOUND', 'Gatilho não encontrado.');
        }
        if (!configuration.active) {
          throw new AdvisorDomainError(
            'TRIGGER_CONFIGURATION_INACTIVE',
            'Gatilho inativo não registra ocorrência nova.',
          );
        }
        const occurrenceKey = buildProactiveOccurrenceKey({
          configurationId: configuration.id,
          periodKey: input.periodKey,
          subjectKey: input.subjectKey,
          parameterKey: configuration.parameterKey,
        });
        const existing = await tx.analyticalEvent.findUnique({
          where: { tenantId_occurrenceKey: { tenantId: input.tenantId, occurrenceKey } },
          include: { insight: true },
        });
        if (existing?.insight) {
          return toOccurrence(existing.occurrenceKey, existing.parameterKey, existing.insight, false);
        }
        try {
          const event = await tx.analyticalEvent.create({
            data: {
              tenantId: input.tenantId,
              triggerConfigurationId: configuration.id,
              eventType: configuration.triggerType,
              parameterKey: configuration.parameterKey,
              periodKey: input.periodKey,
              subjectKey: input.subjectKey,
              occurrenceKey,
              severity: null,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              sourceMetric: input.sourceMetric,
              payload: input.payload as Prisma.InputJsonValue,
              detectedAt: input.detectedAt,
              status: 'DETECTED',
            },
          });
          const insight = await tx.aiInsight.create({
            data: {
              tenantId: input.tenantId,
              analyticalEventId: event.id,
              insightType: configuration.triggerType,
              severity: null,
              source: 'RULE',
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              supportingData: input.payload as Prisma.InputJsonValue,
              narrationStatus: 'AWAITING_NARRATION',
              detectedAt: input.detectedAt,
            },
          });
          return toOccurrence(event.occurrenceKey, event.parameterKey, insight, true);
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }
          const raced = await tx.analyticalEvent.findUnique({
            where: { tenantId_occurrenceKey: { tenantId: input.tenantId, occurrenceKey } },
            include: { insight: true },
          });
          if (!raced?.insight) {
            throw error;
          }
          return toOccurrence(raced.occurrenceKey, raced.parameterKey, raced.insight, false);
        }
      });
    },

    async markRead(input) {
      assertAdvisorTenantId(input.tenantId);
      const insight = await prisma.aiInsight.findFirst({
        where: { id: input.insightId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!insight) {
        throw new AdvisorDomainError('INSIGHT_NOT_FOUND', 'Insight não encontrado neste tenant.');
      }
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, tenantId: true },
      });
      if (!user || (user.tenantId !== null && user.tenantId !== input.tenantId)) {
        throw new AdvisorDomainError(
          'INSIGHT_READER_FORBIDDEN',
          'Leitura não cruza tenant.',
        );
      }
      try {
        const row = await prisma.aiInsightRead.create({
          data: {
            insightId: insight.id,
            tenantId: input.tenantId,
            userId: user.id,
            readAt: input.readAt,
          },
        });
        return { readAt: row.readAt };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const existing = await prisma.aiInsightRead.findUnique({
          where: { insightId_userId: { insightId: insight.id, userId: user.id } },
        });
        if (!existing) {
          throw error;
        }
        return { readAt: existing.readAt };
      }
    },
  };
}

function toOccurrence(
  occurrenceKey: string,
  parameterKey: string,
  insight: {
    id: string;
    analyticalEventId: string;
    narrationStatus: RecordedProactiveOccurrence['narrationStatus'];
    content: string | null;
  },
  created: boolean,
): RecordedProactiveOccurrence {
  return {
    created,
    eventId: insight.analyticalEventId,
    insightId: insight.id,
    occurrenceKey,
    parameterKey,
    narrationStatus: insight.narrationStatus,
    content: insight.content,
  };
}
