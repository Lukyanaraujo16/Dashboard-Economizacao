import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { AdvisorDomainError } from './advisor-domain-error.js';
import {
  ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_EXTENSIONS,
  ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES,
  ADVISOR_KNOWLEDGE_DOCUMENT_MAX_BYTES,
  ADVISOR_KNOWLEDGE_DOCUMENT_ORIGINAL_NAME_MAX,
  type AdvisorKnowledgeDocumentAllowedExtension,
} from './advisor-knowledge-document-limits.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

export type AdvisorKnowledgeDocumentKind = 'MARKDOWN' | 'PDF';

export type AdvisorKnowledgeDocumentValidation = {
  readonly kind: AdvisorKnowledgeDocumentKind;
  readonly extension: AdvisorKnowledgeDocumentAllowedExtension;
  readonly mimeType: string;
  readonly originalFileName: string;
  readonly title: string;
  readonly sizeBytes: number;
  readonly checksum: string;
};

function foldExtension(fileName: string): string {
  const base = path.basename(fileName).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  return base.slice(dot);
}

function sanitizeOriginalFileName(raw: string): string {
  const base = path.basename(raw.replaceAll('\\', '/')).trim();
  if (base.length === 0 || base === '.' || base === '..') {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_FILENAME_INVALID',
      'Nome do arquivo inválido.',
    );
  }
  if (base.includes('\0') || /[<>:"|?*]/.test(base)) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_FILENAME_INVALID',
      'Nome do arquivo contém caracteres não permitidos.',
    );
  }
  if (base.length > ADVISOR_KNOWLEDGE_DOCUMENT_ORIGINAL_NAME_MAX) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_FILENAME_INVALID',
      'Nome do arquivo excede o limite permitido.',
    );
  }
  return base;
}

function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim();
  const cleaned = withoutExt.replace(/\s+/g, ' ').slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'Documento';
}

function isAllowedMime(mimeType: string, kind: AdvisorKnowledgeDocumentKind): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!(ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized)) {
    return false;
  }
  if (kind === 'PDF') {
    return normalized === 'application/pdf';
  }
  return (
    normalized === 'text/markdown' ||
    normalized === 'text/plain' ||
    normalized === 'text/x-markdown'
  );
}

function looksLikeUtf8Text(body: Buffer): boolean {
  if (body.length === 0) {
    return false;
  }
  // Reject NUL and most C0 controls except TAB/LF/CR.
  for (let index = 0; index < Math.min(body.length, 8_192); index += 1) {
    const code = body[index]!;
    if (code === 0) {
      return false;
    }
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return false;
    }
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
    return decoded.length > 0;
  } catch {
    return false;
  }
}

function detectKind(
  extension: string,
  body: Buffer,
): AdvisorKnowledgeDocumentKind | null {
  if (extension === '.pdf') {
    if (body.length >= 5 && body.subarray(0, 5).equals(PDF_MAGIC)) {
      return 'PDF';
    }
    return null;
  }
  if (extension === '.md') {
    if (looksLikeUtf8Text(body)) {
      return 'MARKDOWN';
    }
    return null;
  }
  return null;
}

/**
 * Valida bytes + nome + MIME declarado. Não confia só em extensão.
 */
export function validateAdvisorKnowledgeDocumentUpload(input: {
  readonly body: Buffer;
  readonly originalFileName: string;
  readonly declaredMimeType?: string;
}): AdvisorKnowledgeDocumentValidation {
  if (input.body.byteLength === 0) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_EMPTY',
      'Arquivo de conhecimento ausente ou vazio.',
    );
  }
  if (input.body.byteLength > ADVISOR_KNOWLEDGE_DOCUMENT_MAX_BYTES) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_TOO_LARGE',
      'Arquivo de conhecimento excede o limite de 5 MB.',
    );
  }

  const originalFileName = sanitizeOriginalFileName(input.originalFileName);
  const extension = foldExtension(originalFileName);
  if (
    !(ADVISOR_KNOWLEDGE_DOCUMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_EXTENSION_INVALID',
      'Somente arquivos .md e .pdf são aceitos.',
    );
  }

  const kind = detectKind(extension, input.body);
  if (kind === null) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_CONTENT_INVALID',
      extension === '.pdf'
        ? 'Conteúdo não é um PDF válido.'
        : 'Conteúdo não é um Markdown textual UTF-8 válido.',
    );
  }

  const declared = input.declaredMimeType?.trim().toLowerCase();
  if (declared !== undefined && declared !== '' && !isAllowedMime(declared, kind)) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_MIME_INVALID',
      'Tipo MIME declarado não é permitido para este arquivo.',
    );
  }

  const mimeType =
    kind === 'PDF'
      ? 'application/pdf'
      : declared && isAllowedMime(declared, kind)
        ? declared
        : 'text/markdown';

  return {
    kind,
    extension: extension as AdvisorKnowledgeDocumentAllowedExtension,
    mimeType,
    originalFileName,
    title: titleFromFileName(originalFileName),
    sizeBytes: input.body.byteLength,
    checksum: createHash('sha256').update(input.body).digest('hex'),
  };
}

/**
 * Storage key opaco e tenant-scoped. Nome original NÃO controla o path.
 * Formato: tenants/<tenantId>/knowledge/<uuid>.(md|pdf)
 */
export function createAdvisorKnowledgeDocumentStorageKey(input: {
  readonly tenantId: string;
  readonly extension: AdvisorKnowledgeDocumentAllowedExtension;
}): string {
  if (!UUID_PATTERN.test(input.tenantId)) {
    throw new AdvisorDomainError('TENANT_ID_REQUIRED', 'tenantId inválido para storage key.');
  }
  const ext = input.extension === '.pdf' ? 'pdf' : 'md';
  return `tenants/${input.tenantId.toLowerCase()}/knowledge/${randomUUID()}.${ext}`;
}

export function isAdvisorKnowledgeDocumentStorageKey(storageKey: string): boolean {
  return /^tenants\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/knowledge\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(md|pdf)$/i.test(
    storageKey,
  );
}
