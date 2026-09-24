export const AI_PROVIDER_IDS = ['OPENAI', 'ANTHROPIC'] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_CONSULTANT_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export type AiConsultantStatus = (typeof AI_CONSULTANT_STATUSES)[number];

export const AI_KNOWLEDGE_CONTENT_TYPES = ['TEXT'] as const;

export type AiKnowledgeContentType = (typeof AI_KNOWLEDGE_CONTENT_TYPES)[number];

export const AI_KNOWLEDGE_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export type AiKnowledgeStatus = (typeof AI_KNOWLEDGE_STATUSES)[number];

export const AI_CONVERSATION_STATUSES = ['OPEN', 'CLOSED'] as const;

export type AiConversationStatus = (typeof AI_CONVERSATION_STATUSES)[number];

export const AI_MESSAGE_SENDER_TYPES = ['USER', 'CONSULTANT', 'SYSTEM'] as const;

export type AiMessageSenderType = (typeof AI_MESSAGE_SENDER_TYPES)[number];

export const AI_MESSAGE_TYPES = ['TEXT'] as const;

export type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];

export const AI_RUN_TYPES = ['QUESTION_REPLY'] as const;

export type AiRunType = (typeof AI_RUN_TYPES)[number];

export const AI_RUN_STATUSES = [
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'LIMIT_BLOCKED',
] as const;

export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

export const AI_RUN_ERROR_CODES = [
  'AUTH',
  'RATE_LIMIT',
  'TIMEOUT',
  'MODEL_UNAVAILABLE',
  'BAD_REQUEST',
  'CONTENT_REJECTED',
  'PROVIDER_ERROR',
  'UNKNOWN',
] as const;

export type AiRunErrorCode = (typeof AI_RUN_ERROR_CODES)[number];

export const AI_TONE_PRESETS = [
  'PROFISSIONAL_OBJETIVO',
  'CONSULTIVO',
  'DIDATICO',
  'AMIGAVEL',
  'EXECUTIVO',
  'PERSONALIZADO',
] as const;

export type AiTonePreset = (typeof AI_TONE_PRESETS)[number];

export const DEFAULT_CONSULTANT_NAME = 'Consultor';

export type AiTenantSettingsRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly consultantName: string | null;
  readonly businessSegment: string | null;
  readonly businessDescription: string | null;
  readonly adminPrompt: string | null;
  readonly tonePreset: AiTonePreset;
  readonly tone: string | null;
  readonly status: AiConsultantStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UpsertAiTenantSettingsInput = {
  readonly provider: AiProviderId;
  readonly model?: string;
  readonly consultantName?: string | null;
  readonly businessSegment?: string | null;
  readonly businessDescription?: string | null;
  readonly adminPrompt?: string | null;
  readonly tonePreset?: AiTonePreset;
  readonly tone?: string | null;
  readonly status?: AiConsultantStatus;
};

export type AiPlatformCredentialRecord = {
  readonly id: string;
  readonly provider: AiProviderId;
  readonly encryptedSecret: string;
  readonly displayHint: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AiKnowledgeEntryRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly content: string;
  readonly contentType: AiKnowledgeContentType;
  readonly status: AiKnowledgeStatus;
  readonly createdById: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateAiKnowledgeEntryInput = {
  readonly title: string;
  readonly content: string;
  readonly createdById: string;
  readonly status?: AiKnowledgeStatus;
};

export type UpdateAiKnowledgeEntryInput = {
  readonly title?: string;
  readonly content?: string;
  readonly status?: AiKnowledgeStatus;
};

export type AiConversationRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: AiConversationStatus;
  readonly title: string | null;
  readonly startedAt: Date;
  readonly lastMessageAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateAiConversationInput = {
  readonly title?: string | null;
};

export type AiMessageRecord = {
  readonly id: string;
  readonly conversationId: string;
  readonly tenantId: string;
  readonly senderType: AiMessageSenderType;
  readonly content: string;
  readonly messageType: AiMessageType;
  readonly createdAt: Date;
};

export type CreateAiMessageInput = {
  readonly senderType: AiMessageSenderType;
  readonly content: string;
};

export type AiRunRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly conversationId: string | null;
  readonly messageId: string | null;
  readonly runType: AiRunType;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly status: AiRunStatus;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly durationMs: number | null;
  readonly errorCode: AiRunErrorCode | null;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
};

export type UpdateAiRunInput = {
  readonly status: AiRunStatus;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly durationMs?: number | null;
  readonly errorCode?: AiRunErrorCode | null;
  readonly finishedAt?: Date | null;
  readonly messageId?: string | null;
};

export type CreateAiRunInput = {
  readonly userId?: string | null;
  readonly conversationId?: string | null;
  readonly messageId?: string | null;
  readonly runType?: AiRunType;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly status: AiRunStatus;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly durationMs?: number | null;
  readonly errorCode?: AiRunErrorCode | null;
  readonly finishedAt?: Date | null;
};
