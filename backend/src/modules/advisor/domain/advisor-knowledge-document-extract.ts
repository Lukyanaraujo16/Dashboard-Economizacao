import { PDFParse } from 'pdf-parse';

import { AdvisorDomainError } from './advisor-domain-error.js';
import {
  ADVISOR_KNOWLEDGE_DOCUMENT_MAX_EXTRACTED_CHARS,
  ADVISOR_KNOWLEDGE_DOCUMENT_MIN_PDF_TEXT_CHARS,
} from './advisor-knowledge-document-limits.js';
import { normalizeAdvisorKnowledgeDocumentText } from './advisor-knowledge-document-normalize.js';
import type { AdvisorKnowledgeDocumentKind } from './advisor-knowledge-document-validation.js';

export type AdvisorKnowledgeDocumentExtraction = {
  readonly text: string;
  readonly charCount: number;
};

function decodeMarkdown(body: Buffer): string {
  const withoutBom =
    body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf
      ? body.subarray(3)
      : body;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(withoutBom);
  } catch {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_CONTENT_INVALID',
      'Conteúdo não é um Markdown textual UTF-8 válido.',
    );
  }
}

async function extractPdfText(body: Buffer): Promise<string> {
  const parser = new PDFParse({ data: body });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } catch {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_PDF_PARSE_FAILED',
      'Não foi possível ler o PDF.',
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * Extrai e normaliza texto. PDF sem texto suficiente → FAILED (sem OCR).
 */
export async function extractAdvisorKnowledgeDocumentText(input: {
  readonly body: Buffer;
  readonly kind: AdvisorKnowledgeDocumentKind;
}): Promise<AdvisorKnowledgeDocumentExtraction> {
  const raw =
    input.kind === 'MARKDOWN' ? decodeMarkdown(input.body) : await extractPdfText(input.body);
  const text = normalizeAdvisorKnowledgeDocumentText(raw);

  if (input.kind === 'PDF' && text.length < ADVISOR_KNOWLEDGE_DOCUMENT_MIN_PDF_TEXT_CHARS) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_PDF_NO_TEXT',
      'O PDF não possui texto extraível suficiente.',
    );
  }
  if (text.length === 0) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_EMPTY_TEXT',
      'Nenhum texto útil foi extraído do arquivo.',
    );
  }
  if (text.length > ADVISOR_KNOWLEDGE_DOCUMENT_MAX_EXTRACTED_CHARS) {
    throw new AdvisorDomainError(
      'KNOWLEDGE_DOCUMENT_TEXT_TOO_LARGE',
      'Texto extraído excede o limite permitido.',
    );
  }

  return { text, charCount: text.length };
}
