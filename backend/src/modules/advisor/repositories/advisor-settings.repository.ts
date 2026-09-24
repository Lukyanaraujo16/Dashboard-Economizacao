import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { assertAiProviderId, resolveAiModel } from '../domain/ai-provider-models.js';
import { assertConsultantName } from '../domain/consultant-name.js';
import { assertAiTonePreset, DEFAULT_TONE_PRESET } from '../domain/tone-presets.js';
import type {
  AiConsultantStatus,
  AiTenantSettingsRecord,
  UpsertAiTenantSettingsInput,
} from '../domain/types.js';
import { AI_CONSULTANT_STATUSES } from '../domain/types.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertConsultantStatus(status: string): asserts status is AiConsultantStatus {
  if (!(AI_CONSULTANT_STATUSES as readonly string[]).includes(status)) {
    throw new AdvisorDomainError(
      'AI_CONSULTANT_STATUS_INVALID',
      'Status do Consultor deve ser ACTIVE ou DISABLED.',
    );
  }
}

function toRecord(row: {
  id: string;
  tenantId: string;
  provider: AiTenantSettingsRecord['provider'];
  model: string;
  consultantName: string | null;
  businessSegment: string | null;
  businessDescription: string | null;
  adminPrompt: string | null;
  tonePreset: AiTenantSettingsRecord['tonePreset'];
  tone: string | null;
  status: AiConsultantStatus;
  createdAt: Date;
  updatedAt: Date;
}): AiTenantSettingsRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    model: row.model,
    consultantName: row.consultantName,
    businessSegment: row.businessSegment,
    businessDescription: row.businessDescription,
    adminPrompt: row.adminPrompt,
    tonePreset: row.tonePreset,
    tone: row.tone,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AdvisorSettingsRepository = {
  findSettingsByTenant(tenantId: string): Promise<AiTenantSettingsRecord | null>;
  upsertSettings(tenantId: string, input: UpsertAiTenantSettingsInput): Promise<AiTenantSettingsRecord>;
};

export function createAdvisorSettingsRepository(prisma: PrismaClient): AdvisorSettingsRepository {
  return {
    async findSettingsByTenant(tenantId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.aiTenantSettings.findUnique({
        where: { tenantId },
      });
      return row === null ? null : toRecord(row);
    },

    async upsertSettings(tenantId, input) {
      assertAdvisorTenantId(tenantId);
      assertAiProviderId(input.provider);
      const model = resolveAiModel(input.provider, input.model);
      if (input.status !== undefined) {
        assertConsultantStatus(input.status);
      }
      const tonePreset =
        input.tonePreset === undefined ? undefined : assertAiTonePreset(input.tonePreset);
      const consultantName =
        input.consultantName === undefined
          ? undefined
          : input.consultantName === null || input.consultantName.trim() === ''
            ? null
            : assertConsultantName(input.consultantName);

      const existing = await prisma.aiTenantSettings.findUnique({
        where: { tenantId },
        select: { id: true },
      });

      if (existing === null) {
        const created = await prisma.aiTenantSettings.create({
          data: {
            tenantId,
            provider: input.provider,
            model,
            consultantName: consultantName ?? null,
            businessSegment: normalizeOptionalText(input.businessSegment) ?? null,
            businessDescription: normalizeOptionalText(input.businessDescription) ?? null,
            adminPrompt: normalizeOptionalText(input.adminPrompt) ?? null,
            tonePreset: tonePreset ?? DEFAULT_TONE_PRESET,
            tone: normalizeOptionalText(input.tone) ?? null,
            status: input.status ?? 'DISABLED',
          },
        });
        return toRecord(created);
      }

      const updated = await prisma.aiTenantSettings.update({
        where: { tenantId },
        data: {
          provider: input.provider,
          model,
          consultantName:
            consultantName === undefined ? undefined : consultantName,
          businessSegment:
            input.businessSegment === undefined
              ? undefined
              : (normalizeOptionalText(input.businessSegment) ?? null),
          businessDescription:
            input.businessDescription === undefined
              ? undefined
              : (normalizeOptionalText(input.businessDescription) ?? null),
          adminPrompt:
            input.adminPrompt === undefined
              ? undefined
              : (normalizeOptionalText(input.adminPrompt) ?? null),
          tonePreset,
          tone: input.tone === undefined ? undefined : (normalizeOptionalText(input.tone) ?? null),
          status: input.status,
        },
      });
      return toRecord(updated);
    },
  };
}
