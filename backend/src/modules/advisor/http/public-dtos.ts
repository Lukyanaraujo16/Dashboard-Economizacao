/**
 * Contratos públicos F13.4 — congelados.
 * Sem API key, sem prompt financeiro, sem ai_runs, sem erro de vendor.
 */

export type PublicConsultantStatus =
  | 'ACTIVE'
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE';

export type PublicAiProviderId = 'OPENAI' | 'ANTHROPIC';

export type PublicAdminConsultantSettings = {
  readonly configured: boolean;
  readonly status: 'ACTIVE' | 'DISABLED' | 'NOT_CONFIGURED';
  readonly provider: PublicAiProviderId | null;
  readonly model: string | null;
  readonly businessSegment: string | null;
  readonly businessDescription: string | null;
  readonly adminPrompt: string | null;
  readonly tone: string | null;
  readonly updatedAt: string | null;
};

export type PublicConsultantModelOption = {
  readonly id: string;
  readonly label: string;
};

export type PublicConsultantProviderOption = {
  readonly id: PublicAiProviderId;
  readonly label: string;
  readonly models: readonly PublicConsultantModelOption[];
};

export type PublicConsultantOptions = {
  readonly providers: readonly PublicConsultantProviderOption[];
};

export type PublicKnowledgeEntry = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly contentType: 'TEXT';
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PublicConsultantUserStatus = {
  readonly status: PublicConsultantStatus;
};

export type PublicConsultantConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly status: 'OPEN' | 'CLOSED';
  readonly startedAt: string;
  readonly lastMessageAt: string;
};

export type PublicConsultantMessage = {
  readonly id: string;
  readonly senderType: 'USER' | 'CONSULTANT' | 'SYSTEM';
  readonly content: string;
  readonly createdAt: string;
};

export type PublicConsultantConversationDetail = PublicConsultantConversation & {
  readonly messages: readonly PublicConsultantMessage[];
};

export const ADVISOR_ADMIN_FIELD_LIMITS = {
  businessSegment: 120,
  businessDescription: 2_000,
  adminPrompt: 4_000,
  tone: 120,
  knowledgeTitle: 200,
  knowledgeContent: 8_000,
  conversationTitle: 200,
  messageContent: 4_000,
} as const;
