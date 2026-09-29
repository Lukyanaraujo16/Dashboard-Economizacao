/**
 * Limites centralizados da ingestão documental (F13.8.2A).
 * Conservadores: cabem no budget futuro do Context Builder sem dump integral.
 */
export const ADVISOR_KNOWLEDGE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ADVISOR_KNOWLEDGE_DOCUMENT_MAX_EXTRACTED_CHARS = 200_000;
export const ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS = 2_000;
export const ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS = 4_000;
export const ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNKS = 200;
/** PDF com texto abaixo disso é tratado como não extraível (ex.: escaneado). */
export const ADVISOR_KNOWLEDGE_DOCUMENT_MIN_PDF_TEXT_CHARS = 40;

export const ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX = 200;
export const ADVISOR_KNOWLEDGE_DOCUMENT_ORIGINAL_NAME_MAX = 255;

export const ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_EXTENSIONS = ['.md', '.pdf'] as const;
export const ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES = [
  'text/markdown',
  'text/plain',
  'text/x-markdown',
  'application/pdf',
] as const;

export type AdvisorKnowledgeDocumentAllowedExtension =
  (typeof ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_EXTENSIONS)[number];
