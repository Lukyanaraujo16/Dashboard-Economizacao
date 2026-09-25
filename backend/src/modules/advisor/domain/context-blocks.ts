/**
 * Contrato neutro do Context Builder (F13.2).
 * Nenhum tipo OpenAI/Anthropic. Adapters (F13.3) convertem estes blocos.
 */

export const ADVISOR_CONTEXT_BLOCK_TYPES = [
  'PLATFORM_INSTRUCTIONS',
  'TENANT_PROFILE',
  'ADMIN_CONTEXT',
  'TENANT_KNOWLEDGE',
  'FINANCIAL_FACTS',
  'ANALYTICAL_FACTS',
  'CONVERSATION_HISTORY',
  'USER_QUESTION',
] as const;

export type AdvisorContextBlockType = (typeof ADVISOR_CONTEXT_BLOCK_TYPES)[number];

export const ADVISOR_CONTEXT_TRUST_LEVELS = [
  'PLATFORM',
  'TENANT_CONFIG',
  'UNTRUSTED',
  'ANALYTICAL_FACT',
] as const;

export type AdvisorContextTrustLevel = (typeof ADVISOR_CONTEXT_TRUST_LEVELS)[number];

export type AdvisorContextBlockSource = {
  readonly kind: string;
  readonly monthKey?: string;
  readonly comparisonMonthKey?: string;
  readonly service?: string;
};

export type AdvisorContextBlock = {
  readonly type: AdvisorContextBlockType;
  readonly content: string;
  readonly trustLevel: AdvisorContextTrustLevel;
  readonly source?: AdvisorContextBlockSource;
};

export type AdvisorBuiltContext = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly comparisonMonthKey?: string;
  readonly blocks: readonly AdvisorContextBlock[];
};

/** Default técnico do histórico enviado ao provider. Persistência pode ser maior. */
export const ADVISOR_HISTORY_MESSAGE_LIMIT = 10;

/** Orçamento simples de caracteres (sem tokenizer de vendor). */
export const ADVISOR_CONTEXT_CHAR_BUDGET = 24_000;

export const ADVISOR_CONTEXT_PRESERVATION_ORDER = [
  'PLATFORM_INSTRUCTIONS',
  'USER_QUESTION',
  'FINANCIAL_FACTS',
  'ANALYTICAL_FACTS',
  'TENANT_PROFILE',
  'ADMIN_CONTEXT',
  'CONVERSATION_HISTORY',
  'TENANT_KNOWLEDGE',
] as const satisfies readonly AdvisorContextBlockType[];
