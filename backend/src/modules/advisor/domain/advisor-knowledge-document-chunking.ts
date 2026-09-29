import {
  ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS,
  ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNKS,
  ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS,
} from './advisor-knowledge-document-limits.js';

export type AdvisorKnowledgeDocumentChunkDraft = {
  readonly ordinal: number;
  readonly heading: string | null;
  readonly content: string;
  readonly charCount: number;
};

type Section = {
  readonly heading: string | null;
  readonly body: string;
};

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;

function splitMarkdownSections(text: string): readonly Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    const body = buffer.join('\n').trim();
    if (body.length === 0 && currentHeading === null && sections.length === 0) {
      buffer = [];
      return;
    }
    if (body.length === 0 && currentHeading === null) {
      buffer = [];
      return;
    }
    sections.push({
      heading: currentHeading,
      body: currentHeading === null ? body : `${currentHeading}\n\n${body}`.trim(),
    });
    buffer = [];
  };

  for (const line of lines) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      flush();
      currentHeading = line.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (sections.length === 0 && text.trim().length > 0) {
    return [{ heading: null, body: text.trim() }];
  }
  return sections;
}

function splitPlainParagraphs(text: string): readonly Section[] {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return text.trim().length > 0 ? [{ heading: null, body: text.trim() }] : [];
  }
  return parts.map((body) => ({ heading: null, body }));
}

function splitOversized(content: string, heading: string | null): readonly string[] {
  if (content.length <= ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS) {
    return [content];
  }

  const pieces: string[] = [];
  let remaining = content;
  while (remaining.length > ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS) {
    const window = remaining.slice(0, ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS);
    let cut = window.lastIndexOf('\n\n');
    if (cut < ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS / 2) {
      cut = window.lastIndexOf('\n');
    }
    if (cut < ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS / 2) {
      cut = window.lastIndexOf(' ');
    }
    if (cut < ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS / 2) {
      cut = ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNK_CHARS;
    }
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
    if (heading !== null && remaining.length > 0 && !remaining.startsWith(heading)) {
      // keep heading context only in first piece; subsequent pieces are continuation
    }
  }
  if (remaining.length > 0) {
    pieces.push(remaining);
  }
  return pieces.filter((piece) => piece.length > 0);
}

function mergeSmallSections(sections: readonly Section[]): readonly Section[] {
  const merged: Section[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      previous.body.length + section.body.length + 2 <= ADVISOR_KNOWLEDGE_DOCUMENT_TARGET_CHUNK_CHARS &&
      section.heading === null
    ) {
      merged[merged.length - 1] = {
        heading: previous.heading,
        body: `${previous.body}\n\n${section.body}`,
      };
      continue;
    }
    merged.push(section);
  }
  return merged;
}

/**
 * Chunking determinístico por headings (MD) ou parágrafos (PDF/plain).
 */
export function chunkAdvisorKnowledgeDocumentText(input: {
  readonly text: string;
  readonly kind: 'MARKDOWN' | 'PDF';
}): readonly AdvisorKnowledgeDocumentChunkDraft[] {
  const sections =
    input.kind === 'MARKDOWN'
      ? mergeSmallSections(splitMarkdownSections(input.text))
      : mergeSmallSections(splitPlainParagraphs(input.text));

  const drafts: AdvisorKnowledgeDocumentChunkDraft[] = [];
  for (const section of sections) {
    for (const piece of splitOversized(section.body, section.heading)) {
      if (drafts.length >= ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNKS) {
        break;
      }
      drafts.push({
        ordinal: drafts.length,
        heading: section.heading,
        content: piece,
        charCount: piece.length,
      });
    }
    if (drafts.length >= ADVISOR_KNOWLEDGE_DOCUMENT_MAX_CHUNKS) {
      break;
    }
  }
  return drafts;
}
