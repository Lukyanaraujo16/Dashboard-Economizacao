export type ConsultantProviderId = 'OPENAI' | 'ANTHROPIC';

export type ConsultantStatus = 'ACTIVE' | 'DISABLED';

export type ConsultantSettingsStatus = ConsultantStatus | 'NOT_CONFIGURED';

export type ConsultantKnowledgeStatus = 'ACTIVE' | 'DISABLED';

export type ConsultantKnowledgeContentType = 'TEXT';

export type ConsultantTonePreset =
  | 'PROFISSIONAL_OBJETIVO'
  | 'CONSULTIVO'
  | 'DIDATICO'
  | 'AMIGAVEL'
  | 'EXECUTIVO'
  | 'PERSONALIZADO';

/** Registro público de configuração do Consultor por empresa. */
export type ConsultantSettings = {
  readonly configured: boolean;
  readonly status: ConsultantSettingsStatus;
  readonly provider: ConsultantProviderId | null;
  readonly model: string | null;
  readonly consultantName: string | null;
  readonly businessSegment: string | null;
  readonly businessDescription: string | null;
  readonly adminPrompt: string | null;
  readonly tonePreset: ConsultantTonePreset | null;
  readonly tone: string | null;
  readonly updatedAt: string | null;
};

export type ConsultantModelOption = {
  readonly id: string;
  readonly label: string;
};

export type ConsultantProviderOption = {
  readonly id: ConsultantProviderId;
  readonly label: string;
  readonly models: readonly ConsultantModelOption[];
};

export type ConsultantTonePresetOption = {
  readonly id: ConsultantTonePreset;
  readonly label: string;
};

export type ConsultantOptions = {
  readonly providers: readonly ConsultantProviderOption[];
  readonly tonePresets: readonly ConsultantTonePresetOption[];
};

export type ConsultantProviderCredentialSource = 'MANAGED' | 'ENV' | 'NONE';

export type ConsultantProviderStatus = {
  readonly provider: ConsultantProviderId;
  readonly configured: boolean;
  readonly source: ConsultantProviderCredentialSource;
  readonly displayHint: string | null;
  readonly configuredAt: string | null;
};

export type ConsultantKnowledgeEntry = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly contentType: ConsultantKnowledgeContentType;
  readonly status: ConsultantKnowledgeStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UpdateConsultantSettingsInput = {
  readonly status: ConsultantStatus;
  readonly provider: ConsultantProviderId;
  readonly model: string;
  readonly consultantName: string | null;
  readonly businessSegment: string | null;
  readonly businessDescription: string | null;
  readonly adminPrompt: string | null;
  readonly tonePreset: ConsultantTonePreset;
  readonly tone: string | null;
};

export type CreateConsultantKnowledgeInput = {
  readonly title: string;
  readonly content: string;
  readonly contentType?: ConsultantKnowledgeContentType;
  readonly status?: ConsultantKnowledgeStatus;
};

export type UpdateConsultantKnowledgeInput = {
  readonly title?: string;
  readonly content?: string;
  readonly status?: ConsultantKnowledgeStatus;
};

export const CONSULTANT_FIELD_LIMITS = {
  consultantName: 40,
  businessSegment: 120,
  businessDescription: 2_000,
  adminPrompt: 4_000,
  tone: 500,
  knowledgeTitle: 200,
  knowledgeContent: 8_000,
} as const;

export type ConsultantErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type ConsultantRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unavailable';

export class ConsultantRequestError extends Error {
  readonly kind: ConsultantRequestFailureKind;
  readonly details?: ReadonlyArray<ConsultantErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: ConsultantRequestFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<ConsultantErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ConsultantRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}
