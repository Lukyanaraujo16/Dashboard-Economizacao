/**
 * Elegibilidade estrutural para extract de PendingAnalyticalAction (B.1.1).
 * Sem dicionário de frases de oferta — só decide se a resposta é analítica elegível.
 */

import type { AnalyticalAnswerSource } from './classify-analytical-outcome.js';

export type PendingExtractPathKind = 'ANALYTICAL' | 'META' | 'ERROR';

export type PendingExtractEligibility = {
  readonly eligible: boolean;
  readonly reason:
    | 'ANALYTICAL_REPLY'
    | 'META_REPLY'
    | 'ERROR_REPLY'
    | 'CAPABILITY_DENIED'
    | 'EMPTY_REPLY';
};

/** Fontes que produzem leitura financeira e podem terminar com oferta executável. */
const ELIGIBLE_SOURCES = new Set<AnalyticalAnswerSource>([
  'PROVIDER',
  'COST_CENTER',
  'NOMINAL',
  'COMPARISON',
  'SNAPSHOT',
  'CATEGORY_BREAKDOWN',
  'MOVEMENT_LINES',
  'DAILY_CASH_MOVEMENT',
  'COUNTERPARTY',
  'PLANNING',
  'BILLING',
  'BILLING_SERIES',
]);

/**
 * Gate estrutural: respostas analíticas elegíveis passam pelo extractor semântico.
 * Respostas meta/erro/capability-denied não passam (zero overhead de extract).
 */
export function isReplyEligibleForPendingExtract(input: {
  readonly pathKind: PendingExtractPathKind;
  readonly answerSource: AnalyticalAnswerSource | string;
  readonly assistantText: string;
}): PendingExtractEligibility {
  if (input.pathKind === 'META') {
    return { eligible: false, reason: 'META_REPLY' };
  }
  if (input.pathKind === 'ERROR') {
    return { eligible: false, reason: 'ERROR_REPLY' };
  }
  if (input.answerSource === 'CAPABILITY_DENIED') {
    return { eligible: false, reason: 'CAPABILITY_DENIED' };
  }
  if (input.assistantText.trim() === '') {
    return { eligible: false, reason: 'EMPTY_REPLY' };
  }
  if (
    typeof input.answerSource === 'string' &&
    ELIGIBLE_SOURCES.has(input.answerSource as AnalyticalAnswerSource)
  ) {
    return { eligible: true, reason: 'ANALYTICAL_REPLY' };
  }
  // Path ANALYTICAL com source desconhecido: ainda assim extrai (seguro).
  if (input.pathKind === 'ANALYTICAL') {
    return { eligible: true, reason: 'ANALYTICAL_REPLY' };
  }
  return { eligible: false, reason: 'META_REPLY' };
}
