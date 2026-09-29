/**
 * Recuperação lexical de conhecimento documental (F13.8.2C).
 * Sem embeddings / LLM / vector search.
 */

import {
  ADVISOR_DOCUMENT_KNOWLEDGE_CHAR_BUDGET,
  ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS,
  ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE,
} from './advisor-document-knowledge-limits.js';
import {
  buildAdvisorDocumentKnowledgeQueryText,
  normalizeAdvisorDocumentKnowledgeText,
  tokenizeAdvisorDocumentKnowledgeQuery,
} from './advisor-document-knowledge-query.js';

export type AdvisorDocumentKnowledgeCandidate = {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly ordinal: number;
  readonly heading: string | null;
  readonly content: string;
  readonly charCount: number;
};

export type AdvisorDocumentKnowledgeSelectedChunk = {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly ordinal: number;
  readonly heading: string | null;
  readonly content: string;
  readonly score: number;
};

export type RetrieveAdvisorDocumentKnowledgeResult = {
  readonly inner: string | null;
  readonly selected: readonly AdvisorDocumentKnowledgeSelectedChunk[];
  readonly candidateCount: number;
  readonly selectedCount: number;
  readonly selectedChars: number;
  readonly queryTokenCount: number;
  readonly reason: 'selected' | 'no_tokens' | 'no_candidates' | 'no_match' | 'budget_empty';
};

type ScoredCandidate = AdvisorDocumentKnowledgeCandidate & {
  readonly score: number;
  readonly headingNorm: string;
  readonly contentNorm: string;
};

function countTokenHits(haystack: string, tokens: readonly string[]): number {
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

function scoreCandidate(
  candidate: AdvisorDocumentKnowledgeCandidate,
  tokens: readonly string[],
  phraseNorm: string,
): ScoredCandidate {
  const headingNorm = normalizeAdvisorDocumentKnowledgeText(candidate.heading ?? '');
  const contentNorm = normalizeAdvisorDocumentKnowledgeText(candidate.content);
  const headingHits = headingNorm.length > 0 ? countTokenHits(headingNorm, tokens) : 0;
  const contentHits = countTokenHits(contentNorm, tokens);
  const distinctHits = new Set<string>();
  for (const token of tokens) {
    if (headingNorm.includes(token) || contentNorm.includes(token)) {
      distinctHits.add(token);
    }
  }

  let score = headingHits * 5 + contentHits * 1 + distinctHits.size * 2;

  if (phraseNorm.length >= 8) {
    if (headingNorm.includes(phraseNorm)) {
      score += 20;
    } else if (contentNorm.includes(phraseNorm)) {
      score += 8;
    }
  }

  if (distinctHits.size === 0) {
    score = 0;
  }

  return {
    ...candidate,
    score,
    headingNorm,
    contentNorm,
  };
}

function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (a.documentId !== b.documentId) {
    return a.documentId < b.documentId ? -1 : 1;
  }
  return a.ordinal - b.ordinal;
}

function formatSectionLabel(heading: string | null): string {
  const trimmed = heading?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'Geral';
}

function formatDocumentKnowledgeInner(
  selected: readonly AdvisorDocumentKnowledgeSelectedChunk[],
): string {
  const parts: string[] = [];
  for (const chunk of selected) {
    parts.push(
      `[Documento: ${chunk.documentTitle}]\n[Seção: ${formatSectionLabel(chunk.heading)}]\n\n${chunk.content.trim()}`,
    );
  }
  return parts.join('\n\n');
}

function tryIncludeNeighbor(input: {
  readonly selectedIds: Set<string>;
  readonly byKey: Map<string, ScoredCandidate>;
  readonly anchor: ScoredCandidate;
  readonly direction: -1 | 1;
  readonly remainingBudget: number;
}): ScoredCandidate | null {
  const neighborKey = `${input.anchor.documentId}:${input.anchor.ordinal + input.direction}`;
  const neighbor = input.byKey.get(neighborKey);
  if (!neighbor) {
    return null;
  }
  if (input.selectedIds.has(neighbor.chunkId)) {
    return null;
  }
  if (neighbor.score < ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE) {
    return null;
  }
  // Vizinho só se compartilhou sinal lexical mínimo e cabe no budget.
  if (neighbor.content.length > input.remainingBudget) {
    return null;
  }
  // Mesma seção aproximada: heading igual (normalizado) ou ambos sem heading.
  if (neighbor.headingNorm !== input.anchor.headingNorm) {
    return null;
  }
  return neighbor;
}

/**
 * Seleciona chunks ACTIVE+READY já filtrados pelo repositório e monta o inner UNTRUSTED.
 */
export function retrieveAdvisorDocumentKnowledge(input: {
  readonly question: string;
  readonly recentUserMessages?: readonly string[];
  readonly candidates: readonly AdvisorDocumentKnowledgeCandidate[];
  readonly charBudget?: number;
}): RetrieveAdvisorDocumentKnowledgeResult {
  const budget = input.charBudget ?? ADVISOR_DOCUMENT_KNOWLEDGE_CHAR_BUDGET;
  const queryText = buildAdvisorDocumentKnowledgeQueryText({
    question: input.question,
    recentUserMessages: input.recentUserMessages,
  });
  const tokens = tokenizeAdvisorDocumentKnowledgeQuery(queryText);
  if (tokens.length === 0) {
    return {
      inner: null,
      selected: [],
      candidateCount: input.candidates.length,
      selectedCount: 0,
      selectedChars: 0,
      queryTokenCount: 0,
      reason: 'no_tokens',
    };
  }

  if (input.candidates.length === 0) {
    return {
      inner: null,
      selected: [],
      candidateCount: 0,
      selectedCount: 0,
      selectedChars: 0,
      queryTokenCount: tokens.length,
      reason: 'no_candidates',
    };
  }

  const phraseNorm = normalizeAdvisorDocumentKnowledgeText(input.question.trim());
  const scored = input.candidates
    .map((candidate) => scoreCandidate(candidate, tokens, phraseNorm))
    .filter((candidate) => candidate.score >= ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE)
    .sort(compareScored);

  if (scored.length === 0) {
    return {
      inner: null,
      selected: [],
      candidateCount: input.candidates.length,
      selectedCount: 0,
      selectedChars: 0,
      queryTokenCount: tokens.length,
      reason: 'no_match',
    };
  }

  const byKey = new Map<string, ScoredCandidate>();
  for (const candidate of input.candidates.map((c) => scoreCandidate(c, tokens, phraseNorm))) {
    byKey.set(`${candidate.documentId}:${candidate.ordinal}`, candidate);
  }

  const selected: AdvisorDocumentKnowledgeSelectedChunk[] = [];
  const selectedIds = new Set<string>();
  let usedChars = 0;

  const pushChunk = (candidate: ScoredCandidate): boolean => {
    if (selectedIds.has(candidate.chunkId)) {
      return false;
    }
    if (selected.length >= ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS) {
      return false;
    }
    const sectionLabel = formatSectionLabel(candidate.heading);
    const blockOverhead =
      `[Documento: ${candidate.documentTitle}]\n[Seção: ${sectionLabel}]\n\n`.length +
      (selected.length > 0 ? 2 : 0);
    const remainingForContent = budget - usedChars - blockOverhead;
    if (remainingForContent < 80) {
      return false;
    }
    let content = candidate.content.trim();
    if (content.length > remainingForContent) {
      content = `${content.slice(0, Math.max(0, remainingForContent - 14)).trimEnd()}\n[TRUNCATED]`;
    }
    const needed = blockOverhead + content.length;
    if (usedChars + needed > budget) {
      return false;
    }
    selected.push({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentTitle: candidate.documentTitle,
      ordinal: candidate.ordinal,
      heading: candidate.heading,
      content,
      score: candidate.score,
    });
    selectedIds.add(candidate.chunkId);
    usedChars += needed;
    return true;
  };

  for (const candidate of scored) {
    if (!pushChunk(candidate)) {
      continue;
    }
    const remaining = budget - usedChars;
    const prev = tryIncludeNeighbor({
      selectedIds,
      byKey,
      anchor: candidate,
      direction: -1,
      remainingBudget: remaining,
    });
    if (prev) {
      pushChunk(prev);
    }
    const remainingAfter = budget - usedChars;
    const next = tryIncludeNeighbor({
      selectedIds,
      byKey,
      anchor: candidate,
      direction: 1,
      remainingBudget: remainingAfter,
    });
    if (next) {
      pushChunk(next);
    }
    if (selected.length >= ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS) {
      break;
    }
  }

  // Reordenar por documento + ordinal para leitura coerente (após seleção por score).
  selected.sort((a, b) => {
    if (a.documentId !== b.documentId) {
      return a.documentId < b.documentId ? -1 : 1;
    }
    return a.ordinal - b.ordinal;
  });

  if (selected.length === 0) {
    return {
      inner: null,
      selected: [],
      candidateCount: input.candidates.length,
      selectedCount: 0,
      selectedChars: 0,
      queryTokenCount: tokens.length,
      reason: 'budget_empty',
    };
  }

  const inner = formatDocumentKnowledgeInner(selected);
  return {
    inner,
    selected,
    candidateCount: input.candidates.length,
    selectedCount: selected.length,
    selectedChars: inner.length,
    queryTokenCount: tokens.length,
    reason: 'selected',
  };
}

/** Observabilidade segura (sem pergunta/conteúdo). */
export function emitAdvisorDocumentKnowledgeRetrievedEvent(input: {
  readonly tenantId: string;
  readonly documentIds: readonly string[];
  readonly chunkIds: readonly string[];
  readonly candidateCount: number;
  readonly selectedCount: number;
  readonly selectedChars: number;
  readonly retrievalDurationMs: number;
  readonly queryTokenCount: number;
  readonly reason: RetrieveAdvisorDocumentKnowledgeResult['reason'];
}): void {
  console.info(
    JSON.stringify({
      event: 'advisor_document_knowledge_retrieved',
      tenantId: input.tenantId,
      documentIds: input.documentIds,
      chunkIds: input.chunkIds,
      candidateCount: input.candidateCount,
      selectedCount: input.selectedCount,
      selectedChars: input.selectedChars,
      retrievalDurationMs: input.retrievalDurationMs,
      queryTokenCount: input.queryTokenCount,
      reason: input.reason,
    }),
  );
}
