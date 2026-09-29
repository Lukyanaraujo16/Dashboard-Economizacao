/**
 * Limites da recuperação lexical documental (F13.8.2C / F13.8.2C.1).
 * Conservadores: cabem no budget global de 24k sem expulsar FACTS.
 */

/** Orçamento dedicado do bloco DOCUMENT_KNOWLEDGE (antes dos wrappers). */
export const ADVISOR_DOCUMENT_KNOWLEDGE_CHAR_BUDGET = 5_000;

/** Máximo de chunks candidatos carregados do banco por tenant. */
export const ADVISOR_DOCUMENT_KNOWLEDGE_MAX_CANDIDATE_CHUNKS = 400;

/** Máximo de chunks selecionados após scoring. */
export const ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS = 8;

/** Score mínimo para incluir um chunk (evita ruído). */
export const ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE = 3;

/** Mensagens USER recentes usadas como apoio lexical (além da pergunta atual). */
export const ADVISOR_DOCUMENT_KNOWLEDGE_HISTORY_USER_LIMIT = 2;

/**
 * CURRENT-FIRST (F13.8.2C.1):
 * pergunta atual é suficiente se tiver ≥ este nº de tokens E
 * pelo menos um candidato com currentScore ≥ MIN_SCORE.
 */
export const ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_MIN_TOKENS = 2;

/**
 * Peso do histórico no finalScore quando current é suficiente:
 * finalScore = currentScore * CURRENT_WEIGHT + historyScore.
 * History nunca supera um match current >= MIN_SCORE com scores históricos típicos.
 */
export const ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_SCORE_WEIGHT = 10;

/** Prefixo mínimo compartilhado para match morfológico leve (PT). */
export const ADVISOR_DOCUMENT_KNOWLEDGE_MORPH_PREFIX_MIN = 5;

export const ADVISOR_DOCUMENT_KNOWLEDGE_RETRIEVAL_MODES = [
  'CURRENT_ONLY',
  'CURRENT_WITH_HISTORY_SUPPORT',
  'HISTORY_FALLBACK',
] as const;

export type AdvisorDocumentKnowledgeRetrievalMode =
  (typeof ADVISOR_DOCUMENT_KNOWLEDGE_RETRIEVAL_MODES)[number];
