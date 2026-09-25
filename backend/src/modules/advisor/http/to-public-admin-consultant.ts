import { AI_PROVIDER_MODEL_CATALOG } from '../domain/ai-provider-models.js';
import { toPublicEmojiPreferenceOptions } from '../domain/emoji-preference.js';
import { toPublicTonePresetOptions } from '../domain/tone-presets.js';
import type { AiKnowledgeEntryRecord, AiProviderId, AiTenantSettingsRecord } from '../domain/types.js';
import type {
  PublicAdminConsultantSettings,
  PublicConsultantOptions,
  PublicKnowledgeEntry,
} from './public-dtos.js';

function providerLabel(id: AiProviderId): string {
  switch (id) {
    case 'OPENAI':
      return 'OpenAI';
    case 'ANTHROPIC':
      return 'Anthropic';
  }
}

export function toUnconfiguredAdminConsultantSettings(): PublicAdminConsultantSettings {
  return {
    configured: false,
    status: 'NOT_CONFIGURED',
    provider: null,
    model: null,
    consultantName: null,
    businessSegment: null,
    businessDescription: null,
    adminPrompt: null,
    tonePreset: null,
    tone: null,
    emojiPreference: null,
    updatedAt: null,
  };
}

export function toPublicAdminConsultantSettings(
  record: AiTenantSettingsRecord,
): PublicAdminConsultantSettings {
  return {
    configured: true,
    status: record.status,
    provider: record.provider,
    model: record.model,
    consultantName: record.consultantName,
    businessSegment: record.businessSegment,
    businessDescription: record.businessDescription,
    adminPrompt: record.adminPrompt,
    tonePreset: record.tonePreset,
    tone: record.tone,
    emojiPreference: record.emojiPreference,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toPublicConsultantOptions(): PublicConsultantOptions {
  return {
    providers: (Object.keys(AI_PROVIDER_MODEL_CATALOG) as AiProviderId[]).map((id) => ({
      id,
      label: providerLabel(id),
      models: AI_PROVIDER_MODEL_CATALOG[id].models.map((modelId) => ({
        id: modelId,
        label: modelId,
      })),
    })),
    tonePresets: toPublicTonePresetOptions(),
    emojiPreferences: toPublicEmojiPreferenceOptions(),
  };
}

export function toPublicKnowledgeEntry(record: AiKnowledgeEntryRecord): PublicKnowledgeEntry {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    contentType: 'TEXT',
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
