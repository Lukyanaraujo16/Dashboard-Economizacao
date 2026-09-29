/**
 * Normalização e tokenização determinística para retrieval lexical (F13.8.2C / F13.8.2C.1).
 * Sem LLM. Português básico.
 */

import { ADVISOR_DOCUMENT_KNOWLEDGE_MORPH_PREFIX_MIN } from './advisor-document-knowledge-limits.js';

const STOPWORDS = new Set([
  'a',
  'as',
  'o',
  'os',
  'um',
  'uma',
  'uns',
  'umas',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'ao',
  'aos',
  'à',
  'às',
  'que',
  'qual',
  'quais',
  'quando',
  'onde',
  'como',
  'seu',
  'sua',
  'seus',
  'suas',
  'meu',
  'minha',
  'meus',
  'minhas',
  'eu',
  'voce',
  'você',
  'ele',
  'ela',
  'eles',
  'elas',
  'isso',
  'isto',
  'esse',
  'essa',
  'este',
  'esta',
  'ser',
  'sao',
  'são',
  'foi',
  'era',
  'tem',
  'ter',
  'ha',
  'há',
  'mais',
  'menos',
  'muito',
  'muita',
  'muitos',
  'muitas',
  'ja',
  'já',
  'tambem',
  'também',
  'ainda',
  'sobre',
  'entre',
  'ate',
  'até',
  'ou',
  'mas',
  'se',
  'nao',
  'não',
  'sim',
  'me',
  'te',
  'lhe',
  'nos',
  'vos',
  'pelo',
  'pela',
  'pelos',
  'pelas',
  'num',
  'numa',
]);

export function normalizeAdvisorDocumentKnowledgeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeAdvisorDocumentKnowledgeQuery(raw: string): readonly string[] {
  const normalized = normalizeAdvisorDocumentKnowledgeText(raw);
  if (normalized.length === 0) {
    return [];
  }
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const part of normalized.split(' ')) {
    if (part.length < 2) {
      continue;
    }
    if (STOPWORDS.has(part)) {
      continue;
    }
    if (seen.has(part)) {
      continue;
    }
    seen.add(part);
    tokens.push(part);
  }
  return tokens;
}

/**
 * Match lexical com morfologia leve e conservadora.
 * Ex.: conversar ↔ conversa, analisar ↔ analise, projetar ↔ projecao
 * via prefixo compartilhado ≥ MORPH_PREFIX_MIN. Tokens curtos: só match exato.
 */
export function advisorDocumentKnowledgeTokenMatches(
  haystackNormalized: string,
  token: string,
): boolean {
  if (token.length === 0 || haystackNormalized.length === 0) {
    return false;
  }
  if (haystackNormalized.includes(token)) {
    return true;
  }
  if (token.length < ADVISOR_DOCUMENT_KNOWLEDGE_MORPH_PREFIX_MIN) {
    return false;
  }
  for (const word of haystackNormalized.split(' ')) {
    if (word.length < ADVISOR_DOCUMENT_KNOWLEDGE_MORPH_PREFIX_MIN) {
      continue;
    }
    const shared = sharedPrefixLength(token, word);
    if (shared >= ADVISOR_DOCUMENT_KNOWLEDGE_MORPH_PREFIX_MIN) {
      return true;
    }
  }
  return false;
}

function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) {
    i += 1;
  }
  return i;
}

/** @deprecated Prefer scoring separado CURRENT / HISTORY (F13.8.2C.1). Mantido para compat. */
export function buildAdvisorDocumentKnowledgeQueryText(input: {
  readonly question: string;
  readonly recentUserMessages?: readonly string[];
}): string {
  const parts = [input.question.trim()];
  for (const message of input.recentUserMessages ?? []) {
    const trimmed = message.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
  }
  return parts.join('\n');
}
