/**
 * Recuperação lexical de conhecimento documental (F13.8.2C / F13.8.2C.1).
 * CURRENT-FIRST: pergunta atual é autoridade; histórico USER é suporte/fallback.
 * Sem embeddings / LLM / vector search.
 */

import {
  ADVISOR_DOCUMENT_KNOWLEDGE_CHAR_BUDGET,
  ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_MIN_TOKENS,
  ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_SCORE_WEIGHT,
  ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS,
  ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE,
  type AdvisorDocumentKnowledgeRetrievalMode,
} from './advisor-document-knowledge-limits.js';
import {
  advisorDocumentKnowledgeTokenMatches,
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
  readonly currentScore: number;
  readonly historyScore: number;
};

export type RetrieveAdvisorDocumentKnowledgeResult = {
  readonly inner: string | null;
  readonly selected: readonly AdvisorDocumentKnowledgeSelectedChunk[];
  readonly candidateCount: number;
  readonly selectedCount: number;
  readonly selectedChars: number;
  readonly queryTokenCount: number;
  readonly currentTermCount: number;
  readonly historyTermCount: number;
  readonly retrievalMode: AdvisorDocumentKnowledgeRetrievalMode | null;
  readonly reason: 'selected' | 'no_tokens' | 'no_candidates' | 'no_match' | 'budget_empty';
};

type LayerScore = {
  readonly score: number;
  readonly headingHits: number;
  readonly contentHits: number;
  readonly distinctCount: number;
};

type ScoredCandidate = AdvisorDocumentKnowledgeCandidate & {
  readonly currentScore: number;
  readonly historyScore: number;
  readonly score: number;
  readonly headingNorm: string;
  readonly contentNorm: string;
};

function countTokenHits(haystack: string, tokens: readonly string[]): number {
  let hits = 0;
  for (const token of tokens) {
    if (advisorDocumentKnowledgeTokenMatches(haystack, token)) {
      hits += 1;
    }
  }
  return hits;
}

function scoreAgainstTokens(
  headingNorm: string,
  contentNorm: string,
  tokens: readonly string[],
  phraseNorm: string,
): LayerScore {
  if (tokens.length === 0) {
    return { score: 0, headingHits: 0, contentHits: 0, distinctCount: 0 };
  }
  const headingHits = headingNorm.length > 0 ? countTokenHits(headingNorm, tokens) : 0;
  const contentHits = countTokenHits(contentNorm, tokens);
  const distinctHits = new Set<string>();
  for (const token of tokens) {
    if (
      advisorDocumentKnowledgeTokenMatches(headingNorm, token) ||
      advisorDocumentKnowledgeTokenMatches(contentNorm, token)
    ) {
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
    score,
    headingHits,
    contentHits,
    distinctCount: distinctHits.size,
  };
}

function scoreCandidateLayers(
  candidate: AdvisorDocumentKnowledgeCandidate,
  currentTokens: readonly string[],
  historyTokens: readonly string[],
  phraseNorm: string,
  mode: AdvisorDocumentKnowledgeRetrievalMode,
): ScoredCandidate {
  const headingNorm = normalizeAdvisorDocumentKnowledgeText(candidate.heading ?? '');
  const contentNorm = normalizeAdvisorDocumentKnowledgeText(candidate.content);
  const current = scoreAgainstTokens(headingNorm, contentNorm, currentTokens, phraseNorm);
  const history = scoreAgainstTokens(headingNorm, contentNorm, historyTokens, '');

  let score: number;
  if (mode === 'HISTORY_FALLBACK') {
    // Fallback: current still counts, history is primary signal.
    score = current.score + history.score * ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_SCORE_WEIGHT;
  } else if (mode === 'CURRENT_ONLY') {
    score = current.score;
  } else {
    // CURRENT_WITH_HISTORY_SUPPORT: current dominates; history is weak support.
    score =
      current.score * ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_SCORE_WEIGHT + history.score;
  }

  return {
    ...candidate,
    currentScore: current.score,
    historyScore: history.score,
    score,
    headingNorm,
    contentNorm,
  };
}

function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.currentScore !== a.currentScore) {
    return b.currentScore - a.currentScore;
  }
  if (b.historyScore !== a.historyScore) {
    return b.historyScore - a.historyScore;
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
  readonly requireCurrentSignal: boolean;
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
  if (input.requireCurrentSignal && neighbor.currentScore < ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE) {
    // Em CURRENT-FIRST, vizinho precisa de sinal atual (ou herda heading da mesma seção
    // com currentScore do âncora já relevante — aqui exigimos currentScore>0 mínimo).
    if (neighbor.currentScore <= 0) {
      return null;
    }
  }
  if (neighbor.content.length > input.remainingBudget) {
    return null;
  }
  if (neighbor.headingNorm !== input.anchor.headingNorm) {
    return null;
  }
  return neighbor;
}

function emptyResult(
  candidateCount: number,
  currentTermCount: number,
  historyTermCount: number,
  reason: RetrieveAdvisorDocumentKnowledgeResult['reason'],
  retrievalMode: AdvisorDocumentKnowledgeRetrievalMode | null,
): RetrieveAdvisorDocumentKnowledgeResult {
  return {
    inner: null,
    selected: [],
    candidateCount,
    selectedCount: 0,
    selectedChars: 0,
    queryTokenCount: currentTermCount + historyTermCount,
    currentTermCount,
    historyTermCount,
    retrievalMode,
    reason,
  };
}

/**
 * Decisão CURRENT-FIRST (F13.8.2C.1):
 * current suficiente ⇔ ≥ CURRENT_MIN_TOKENS tokens atuais E ≥1 candidato com
 * currentScore ≥ MIN_SCORE. Nesse caso o pool restringe-se a matches atuais;
 * history só apoia ranking dentro do pool. Caso contrário: HISTORY_FALLBACK.
 */
export function isAdvisorDocumentKnowledgeCurrentQuerySufficient(input: {
  readonly currentTokens: readonly string[];
  readonly candidatesWithCurrentMatch: number;
}): boolean {
  return (
    input.currentTokens.length >= ADVISOR_DOCUMENT_KNOWLEDGE_CURRENT_MIN_TOKENS &&
    input.candidatesWithCurrentMatch > 0
  );
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
  const currentTokens = tokenizeAdvisorDocumentKnowledgeQuery(input.question);
  const historyText = (input.recentUserMessages ?? []).join('\n');
  const historyTokens = tokenizeAdvisorDocumentKnowledgeQuery(historyText);

  if (currentTokens.length === 0 && historyTokens.length === 0) {
    return emptyResult(input.candidates.length, 0, 0, 'no_tokens', null);
  }

  if (input.candidates.length === 0) {
    return emptyResult(0, currentTokens.length, historyTokens.length, 'no_candidates', null);
  }

  const phraseNorm = normalizeAdvisorDocumentKnowledgeText(input.question.trim());

  // Pré-score current-only para decidir o modo.
  const currentOnlyProbe = input.candidates.map((candidate) => {
    const headingNorm = normalizeAdvisorDocumentKnowledgeText(candidate.heading ?? '');
    const contentNorm = normalizeAdvisorDocumentKnowledgeText(candidate.content);
    return scoreAgainstTokens(headingNorm, contentNorm, currentTokens, phraseNorm).score;
  });
  const candidatesWithCurrentMatch = currentOnlyProbe.filter(
    (score) => score >= ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE,
  ).length;

  let mode: AdvisorDocumentKnowledgeRetrievalMode;
  if (currentTokens.length === 0) {
    mode = 'HISTORY_FALLBACK';
  } else if (
    isAdvisorDocumentKnowledgeCurrentQuerySufficient({
      currentTokens,
      candidatesWithCurrentMatch,
    })
  ) {
    mode =
      historyTokens.length > 0 ? 'CURRENT_WITH_HISTORY_SUPPORT' : 'CURRENT_ONLY';
  } else {
    mode = historyTokens.length > 0 ? 'HISTORY_FALLBACK' : 'CURRENT_ONLY';
  }

  let scored = input.candidates
    .map((candidate) =>
      scoreCandidateLayers(candidate, currentTokens, historyTokens, phraseNorm, mode),
    )
    .filter((candidate) => candidate.score >= ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE);

  // CURRENT-FIRST: quando a pergunta atual é suficiente, exclui chunks só-históricos.
  if (mode === 'CURRENT_WITH_HISTORY_SUPPORT' || (mode === 'CURRENT_ONLY' && currentTokens.length > 0)) {
    const currentPool = scored.filter(
      (candidate) => candidate.currentScore >= ADVISOR_DOCUMENT_KNOWLEDGE_MIN_SCORE,
    );
    if (currentPool.length > 0) {
      scored = currentPool;
    }
  }

  scored.sort(compareScored);

  if (scored.length === 0) {
    return emptyResult(
      input.candidates.length,
      currentTokens.length,
      historyTokens.length,
      'no_match',
      mode,
    );
  }

  const byKey = new Map<string, ScoredCandidate>();
  for (const candidate of input.candidates.map((c) =>
    scoreCandidateLayers(c, currentTokens, historyTokens, phraseNorm, mode),
  )) {
    byKey.set(`${candidate.documentId}:${candidate.ordinal}`, candidate);
  }

  const selected: AdvisorDocumentKnowledgeSelectedChunk[] = [];
  const selectedIds = new Set<string>();
  let usedChars = 0;
  const requireCurrentSignal =
    mode === 'CURRENT_WITH_HISTORY_SUPPORT' || mode === 'CURRENT_ONLY';

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
      currentScore: candidate.currentScore,
      historyScore: candidate.historyScore,
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
      requireCurrentSignal,
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
      requireCurrentSignal,
    });
    if (next) {
      pushChunk(next);
    }
    if (selected.length >= ADVISOR_DOCUMENT_KNOWLEDGE_MAX_SELECTED_CHUNKS) {
      break;
    }
  }

  selected.sort((a, b) => {
    if (a.documentId !== b.documentId) {
      return a.documentId < b.documentId ? -1 : 1;
    }
    return a.ordinal - b.ordinal;
  });

  if (selected.length === 0) {
    return emptyResult(
      input.candidates.length,
      currentTokens.length,
      historyTokens.length,
      'budget_empty',
      mode,
    );
  }

  const inner = formatDocumentKnowledgeInner(selected);
  return {
    inner,
    selected,
    candidateCount: input.candidates.length,
    selectedCount: selected.length,
    selectedChars: inner.length,
    queryTokenCount: currentTokens.length + historyTokens.length,
    currentTermCount: currentTokens.length,
    historyTermCount: historyTokens.length,
    retrievalMode: mode,
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
  readonly currentTermCount?: number;
  readonly historyTermCount?: number;
  readonly retrievalMode?: AdvisorDocumentKnowledgeRetrievalMode | null;
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
      currentTermCount: input.currentTermCount ?? null,
      historyTermCount: input.historyTermCount ?? null,
      retrievalMode: input.retrievalMode ?? null,
      reason: input.reason,
    }),
  );
}
