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

export type PublicAiTonePreset =
  | 'PROFISSIONAL_OBJETIVO'
  | 'CONSULTIVO'
  | 'DIDATICO'
  | 'AMIGAVEL'
  | 'EXECUTIVO'
  | 'PERSONALIZADO';

export type PublicAdminConsultantSettings = {
  readonly configured: boolean;
  readonly status: 'ACTIVE' | 'DISABLED' | 'NOT_CONFIGURED';
  readonly provider: PublicAiProviderId | null;
  readonly model: string | null;
  readonly consultantName: string | null;
  readonly businessSegment: string | null;
  readonly businessDescription: string | null;
  readonly adminPrompt: string | null;
  readonly tonePreset: PublicAiTonePreset | null;
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

export type PublicConsultantTonePresetOption = {
  readonly id: PublicAiTonePreset;
  readonly label: string;
};

export type PublicConsultantOptions = {
  readonly providers: readonly PublicConsultantProviderOption[];
  readonly tonePresets: readonly PublicConsultantTonePresetOption[];
};

export type PublicConsultantProviderCredentialSource = 'MANAGED' | 'ENV' | 'NONE';

export type PublicConsultantProviderStatus = {
  readonly provider: PublicAiProviderId;
  readonly configured: boolean;
  readonly source: PublicConsultantProviderCredentialSource;
  readonly displayHint: string | null;
  readonly configuredAt: string | null;
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
  readonly consultantName: string;
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
  consultantName: 40,
  businessSegment: 120,
  businessDescription: 2_000,
  adminPrompt: 4_000,
  tone: 500,
  knowledgeTitle: 200,
  knowledgeContent: 8_000,
  conversationTitle: 200,
  messageContent: 4_000,
  credential: 512,
} as const;
