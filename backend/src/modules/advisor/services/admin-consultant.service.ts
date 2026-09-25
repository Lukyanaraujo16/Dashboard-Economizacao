import { ConflictError, NotFoundError } from '../../../shared/errors/application-error.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { consultantActivationBlockedReason } from '../domain/consultant-activation.js';
import type {
  AiProviderId,
  CreateAiKnowledgeEntryInput,
  UpdateAiKnowledgeEntryInput,
  UpsertAiTenantSettingsInput,
} from '../domain/types.js';
import type { AdvisorKnowledgeRepository } from '../repositories/advisor-knowledge.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type {
  PublicAdminConsultantSettings,
  PublicConsultantOptions,
  PublicKnowledgeEntry,
} from '../http/public-dtos.js';
import {
  toPublicAdminConsultantSettings,
  toPublicConsultantOptions,
  toPublicKnowledgeEntry,
  toUnconfiguredAdminConsultantSettings,
} from '../http/to-public-admin-consultant.js';
import { withAdvisorDomainError } from './map-advisor-http-error.js';

export type AdminConsultantService = {
  listOptions(): PublicConsultantOptions;
  getSettings(tenantId: string): Promise<PublicAdminConsultantSettings>;
  upsertSettings(
    tenantId: string,
    input: UpsertAiTenantSettingsInput,
  ): Promise<PublicAdminConsultantSettings>;
  listKnowledge(tenantId: string): Promise<readonly PublicKnowledgeEntry[]>;
  createKnowledge(
    tenantId: string,
    input: Omit<CreateAiKnowledgeEntryInput, 'createdById'>,
    createdById: string,
  ): Promise<PublicKnowledgeEntry>;
  updateKnowledge(
    tenantId: string,
    entryId: string,
    input: UpdateAiKnowledgeEntryInput,
  ): Promise<PublicKnowledgeEntry>;
  deleteKnowledge(tenantId: string, entryId: string): Promise<void>;
};

export function createAdminConsultantService(deps: {
  readonly tenants: TenantRepository;
  readonly settings: AdvisorSettingsRepository;
  readonly knowledge: AdvisorKnowledgeRepository;
  readonly nodeEnv?: string;
  readonly resolveProviderApiKey?: (provider: AiProviderId) => Promise<string | null>;
}): AdminConsultantService {
  async function requireTenant(tenantId: string): Promise<void> {
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Empresa não encontrada.');
    }
  }

  return {
    listOptions() {
      return toPublicConsultantOptions();
    },

    async getSettings(tenantId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const settings = await deps.settings.findSettingsByTenant(tenantId);
        return settings === null
          ? toUnconfiguredAdminConsultantSettings()
          : toPublicAdminConsultantSettings(settings);
      });
    },

    async upsertSettings(tenantId, input) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        if (input.status === 'ACTIVE') {
          const key = deps.resolveProviderApiKey
            ? await deps.resolveProviderApiKey(input.provider)
            : null;
          const blocked = consultantActivationBlockedReason({
            status: input.status,
            provider: input.provider,
            credentialAvailable: key !== null && key.trim().length > 0,
            nodeEnv: deps.nodeEnv ?? process.env.NODE_ENV ?? 'development',
          });
          if (blocked) {
            throw new ConflictError(blocked);
          }
        }
        const settings = await deps.settings.upsertSettings(tenantId, input);
        return toPublicAdminConsultantSettings(settings);
      });
    },

    async listKnowledge(tenantId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const entries = await deps.knowledge.listKnowledge(tenantId);
        return entries.map(toPublicKnowledgeEntry);
      });
    },

    async createKnowledge(tenantId, input, createdById) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const entry = await deps.knowledge.createKnowledge(tenantId, {
          ...input,
          createdById,
        });
        return toPublicKnowledgeEntry(entry);
      });
    },

    async updateKnowledge(tenantId, entryId, input) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const existing = await deps.knowledge.findKnowledgeById(tenantId, entryId);
        if (existing === null) {
          throw new NotFoundError('Entrada de conhecimento não encontrada neste tenant.');
        }
        const entry = await deps.knowledge.updateKnowledge(tenantId, entryId, input);
        return toPublicKnowledgeEntry(entry);
      });
    },

    async deleteKnowledge(tenantId, entryId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const existing = await deps.knowledge.findKnowledgeById(tenantId, entryId);
        if (existing === null) {
          throw new NotFoundError('Entrada de conhecimento não encontrada neste tenant.');
        }
        await deps.knowledge.deleteKnowledge(tenantId, entryId);
      });
    },
  };
}
