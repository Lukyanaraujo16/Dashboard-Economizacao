/**
 * Limites da recuperação documental lexical (F13.8.2C).
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
