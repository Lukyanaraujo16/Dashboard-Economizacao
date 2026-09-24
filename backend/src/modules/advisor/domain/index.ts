export { AdvisorDomainError } from './advisor-domain-error.js';
export {
  CONSULTANT_PLATFORM_LIMIT_MESSAGE,
  CONSULTANT_RATE_LIMIT_TENANT_MAX,
  CONSULTANT_RATE_LIMIT_USER_MAX,
  CONSULTANT_RATE_LIMIT_WINDOW_SECONDS,
  CONSULTANT_UNAVAILABLE_MESSAGE,
  DEFAULT_CONSULTANT_RATE_LIMIT_POLICY,
  buildConsultantTenantRateLimitKey,
  buildConsultantUserRateLimitKey,
  resolveConsultantRateLimitPolicy,
} from './consultant-rate-limit.js';
export type {
  ConsultantRateLimitConsumeInput,
  ConsultantRateLimitDecision,
  ConsultantRateLimitPolicy,
  ConsultantRateLimiter,
} from './consultant-rate-limit.js';
export {
  ADVISOR_CONTEXT_BLOCK_TYPES,
  ADVISOR_CONTEXT_CHAR_BUDGET,
  ADVISOR_CONTEXT_PRESERVATION_ORDER,
  ADVISOR_CONTEXT_TRUST_LEVELS,
  ADVISOR_HISTORY_MESSAGE_LIMIT,
} from './context-blocks.js';
export type {
  AdvisorBuiltContext,
  AdvisorContextBlock,
  AdvisorContextBlockSource,
  AdvisorContextBlockType,
  AdvisorContextTrustLevel,
} from './context-blocks.js';
export { ADVISOR_FINANCIAL_ABSENT, formatAdvisorFinancialAmount } from './financial-facts-text.js';
export { ADVISOR_PERIOD_SOURCES, resolveAdvisorPeriod } from './resolve-advisor-period.js';
export type {
  AdvisorPeriodSource,
  AdvisorResolvedPeriod,
  ResolveAdvisorPeriodInput,
} from './resolve-advisor-period.js';
export {
  CONSULTANT_NAME_MAX_LENGTH,
  assertConsultantName,
  normalizeConsultantName,
  resolveConsultantDisplayName,
} from './consultant-name.js';
export {
  CONVERSATION_TITLE_MAX_LENGTH,
  DEFAULT_CONVERSATION_TITLE,
  deriveConsultantConversationTitle,
} from './conversation-title.js';
export { ADVISOR_PLATFORM_INSTRUCTIONS } from './platform-instructions.js';
export {
  isPlatformAiProviderConfigured,
  resolvePlatformAiApiKey,
} from './resolve-platform-ai-key.js';
export type { ResolvePlatformAiApiKeyInput } from './resolve-platform-ai-key.js';
export {
  AI_TONE_PRESET_INSTRUCTIONS,
  AI_TONE_PRESET_LABELS,
  DEFAULT_TONE_PRESET,
  assertAiTonePreset,
  isAiTonePreset,
  resolveToneInstruction,
  toPublicTonePresetOptions,
} from './tone-presets.js';
export { delimitUntrustedContent } from './untrusted-content.js';
export {
  AI_PROVIDER_MODEL_CATALOG,
  assertAiProviderId,
  assertAllowedAiModel,
  defaultModelForProvider,
  isAiProviderId,
  isAllowedAiModel,
  resolveAiModel,
} from './ai-provider-models.js';
export {
  AI_CONSULTANT_STATUSES,
  AI_CONVERSATION_STATUSES,
  AI_KNOWLEDGE_CONTENT_TYPES,
  AI_KNOWLEDGE_STATUSES,
  AI_MESSAGE_SENDER_TYPES,
  AI_MESSAGE_TYPES,
  AI_PROVIDER_IDS,
  AI_RUN_ERROR_CODES,
  AI_RUN_STATUSES,
  AI_RUN_TYPES,
  AI_TONE_PRESETS,
  DEFAULT_CONSULTANT_NAME,
} from './types.js';
export type {
  AiConsultantStatus,
  AiConversationRecord,
  AiPlatformCredentialRecord,
  AiTonePreset,
  AiConversationStatus,
  AiKnowledgeContentType,
  AiKnowledgeEntryRecord,
  AiKnowledgeStatus,
  AiMessageRecord,
  AiMessageSenderType,
  AiMessageType,
  AiProviderId,
  AiRunErrorCode,
  AiRunRecord,
  AiRunStatus,
  AiRunType,
  AiTenantSettingsRecord,
  CreateAiConversationInput,
  CreateAiKnowledgeEntryInput,
  CreateAiMessageInput,
  CreateAiRunInput,
  UpdateAiRunInput,
  UpdateAiKnowledgeEntryInput,
  UpsertAiTenantSettingsInput,
} from './types.js';
