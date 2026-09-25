import { ADVISOR_DRILLDOWN_DEFAULT_LIMIT } from './advisor-cash-realized-breakdown.js';
import { splitAdvisorEntityQuery } from './advisor-nominal-dimension.js';
import {
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from './advisor-nominal-dimension.js';
import { resolveAdvisorDrilldownIntent } from './resolve-advisor-drilldown-intent.js';
import {
  extractAdvisorNominalEntityQuery,
  resolveAdvisorNominalIntent,
  type AdvisorNominalIntent,
} from './resolve-advisor-nominal-intent.js';

export type AdvisorNominalAnaphoraStatus =
  | 'NONE'
  | 'RESOLVED'
  | 'AMBIGUOUS'
  | 'UNRESOLVED'
  | 'NEEDS_RANKING_WINNER';

export type AdvisorConversationalNominal = {
  readonly intent: AdvisorNominalIntent | null;
  readonly anaphora: AdvisorNominalAnaphoraStatus;
  readonly needsRankingWinner: boolean;
  readonly rankingQuestion: string | null;
};

/**
 * Continuidade nominal entre turns USER da mesma conversa.
 * Não lê texto do assistant. Não vaza entre conversas/tenants.
 */
export function resolveAdvisorConversationalNominal(input: {
  readonly content: string;
  readonly priorUserContents?: readonly string[];
  readonly comparison?: boolean;
}): AdvisorConversationalNominal {
  const direct = resolveAdvisorNominalIntent(input.content, {
    comparison: input.comparison,
  });
  if (direct !== null && direct.entityQuery !== undefined) {
    return {
      intent: direct,
      anaphora: 'NONE',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }
  if (direct !== null && direct.toolName === CASH_NOMINAL_RANKING_TOOL_NAME) {
    return {
      intent: direct,
      anaphora: 'NONE',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }
  if (resolveAdvisorDrilldownIntent(input.content) !== null) {
    return {
      intent: direct,
      anaphora: 'NONE',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }

  const anaphoric = isAdvisorNominalAnaphora(input.content);
  const periodFollowUp = isAdvisorNominalPeriodFollowUp(input.content);
  if (!anaphoric && !periodFollowUp) {
    return {
      intent: direct,
      anaphora: 'NONE',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }

  const anchor = resolveNominalAnchor(input.priorUserContents ?? []);
  if (anchor.kind === 'ambiguous') {
    return {
      intent: null,
      anaphora: 'AMBIGUOUS',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }
  if (anchor.kind === 'entity') {
    return {
      intent: {
        toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
        entityQuery: anchor.entityQuery,
        categoryReference: 'convenio',
        limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
      },
      anaphora: 'RESOLVED',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }
  if (anchor.kind === 'ranking') {
    return {
      intent: null,
      anaphora: 'NEEDS_RANKING_WINNER',
      needsRankingWinner: true,
      rankingQuestion: anchor.question,
    };
  }
  return {
    intent: null,
    anaphora: anaphoric ? 'UNRESOLVED' : 'NONE',
    needsRankingWinner: false,
    rankingQuestion: null,
  };
}

export function isAdvisorNominalAnaphora(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\b(?:desse|desta|dessa|esse|esta|essa)\s+(?:convenio|empresa|parceiro|entidade)\b/.test(folded) ||
    /\bquanto (?:eu )?recebi (?:desse|dessa|dele|dela)\b/.test(folded)
  );
}

export function isAdvisorNominalPeriodFollowUp(content: string): boolean {
  const folded = foldPt(content).replace(/[?.!]/g, '').trim();
  return /^(?:e em |agora em |e no mes|e nesse mes|e neste mes)/.test(folded);
}

export function extractExplicitNominalEntities(content: string): readonly string[] {
  const query = extractAdvisorNominalEntityQuery(content);
  if (query === null) {
    return [];
  }
  return splitAdvisorEntityQuery(query);
}

function resolveNominalAnchor(
  priorUserContents: readonly string[],
):
  | { readonly kind: 'none' }
  | { readonly kind: 'entity'; readonly entityQuery: string }
  | { readonly kind: 'ranking'; readonly question: string }
  | { readonly kind: 'ambiguous' } {
  for (let index = priorUserContents.length - 1; index >= 0; index -= 1) {
    const content = priorUserContents[index]!;
    const entities = extractExplicitNominalEntities(content);
    if (entities.length > 1) {
      return { kind: 'ambiguous' };
    }
    if (entities.length === 1) {
      return { kind: 'entity', entityQuery: entities[0]! };
    }
    const intent = resolveAdvisorNominalIntent(content);
    if (intent?.toolName === CASH_NOMINAL_RANKING_TOOL_NAME) {
      return { kind: 'ranking', question: content };
    }
  }
  return { kind: 'none' };
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
