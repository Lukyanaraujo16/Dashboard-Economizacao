import { ADVISOR_DRILLDOWN_DEFAULT_LIMIT } from './advisor-cash-realized-breakdown.js';
import { splitAdvisorEntityQuery } from './advisor-nominal-dimension.js';
import {
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from './advisor-nominal-dimension.js';
import {
  isAdvisorInterpretiveQuestion,
  isAdvisorNominalIdentityFollowUp,
} from './classify-advisor-factual-response.js';
import { resolveAdvisorDrilldownIntent } from './resolve-advisor-drilldown-intent.js';
import {
  extractAdvisorNominalEntityQuery,
  extractShortNominalEntityProbe,
  resolveAdvisorNominalIntent,
  type AdvisorNominalIntent,
} from './resolve-advisor-nominal-intent.js';

export type AdvisorNominalAnaphoraStatus =
  | 'NONE'
  | 'RESOLVED'
  | 'AMBIGUOUS'
  | 'UNRESOLVED'
  | 'NEEDS_RANKING_WINNER'
  | 'IDENTITY_FOLLOW_UP';

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
  readonly now?: Date;
}): AdvisorConversationalNominal {
  const prior = input.priorUserContents ?? [];
  const direct = resolveAdvisorNominalIntent(input.content, {
    comparison: input.comparison,
    now: input.now,
  });
  if (direct !== null && direct.entityQuery !== undefined) {
    const enriched = enrichLookupWithPriorDimension(direct, prior, input.now);
    return {
      intent: enriched.intent,
      anaphora: enriched.inherited ? 'RESOLVED' : 'NONE',
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
  if (isAdvisorNominalIdentityFollowUp(input.content)) {
    const identityAnchor = resolveNominalAnchor(prior, input.now);
    if (identityAnchor.kind === 'ranking') {
      return {
        intent: {
          toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
          categoryReference: identityAnchor.categoryReference ?? 'convenio',
          limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
          ...(identityAnchor.civilRange !== undefined
            ? { civilRange: identityAnchor.civilRange }
            : {}),
        },
        anaphora: 'IDENTITY_FOLLOW_UP',
        needsRankingWinner: false,
        rankingQuestion: identityAnchor.question,
      };
    }
    if (identityAnchor.kind === 'entity') {
      return {
        intent: {
          toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
          categoryReference: identityAnchor.categoryReference ?? 'convenio',
          limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
          ...(identityAnchor.civilRange !== undefined
            ? { civilRange: identityAnchor.civilRange }
            : {}),
        },
        anaphora: 'IDENTITY_FOLLOW_UP',
        needsRankingWinner: false,
        rankingQuestion: null,
      };
    }
    return {
      intent: null,
      anaphora: 'UNRESOLVED',
      needsRankingWinner: false,
      rankingQuestion: null,
    };
  }
  if (isAdvisorInterpretiveQuestion(input.content)) {
    const interpretiveAnchor = resolveNominalAnchor(prior, input.now);
    if (interpretiveAnchor.kind === 'ranking') {
      return {
        intent: {
          toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
          categoryReference: interpretiveAnchor.categoryReference ?? 'convenio',
          limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
          ...(interpretiveAnchor.civilRange !== undefined
            ? { civilRange: interpretiveAnchor.civilRange }
            : {}),
        },
        anaphora: 'NONE',
        needsRankingWinner: false,
        rankingQuestion: interpretiveAnchor.question,
      };
    }
    if (interpretiveAnchor.kind === 'entity') {
      return {
        intent: {
          toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
          entityQuery: interpretiveAnchor.entityQuery,
          categoryReference: interpretiveAnchor.categoryReference ?? 'convenio',
          limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
          ...(interpretiveAnchor.civilRange !== undefined
            ? { civilRange: interpretiveAnchor.civilRange }
            : {}),
        },
        anaphora: 'RESOLVED',
        needsRankingWinner: false,
        rankingQuestion: null,
      };
    }
  }

  const shortEntity = extractShortNominalEntityProbe(input.content);
  if (shortEntity !== null) {
    const priorContext = resolvePriorNominalDimensionContext(prior, input.now);
    if (priorContext === null) {
      return {
        intent: null,
        anaphora: 'UNRESOLVED',
        needsRankingWinner: false,
        rankingQuestion: null,
      };
    }
    return {
      intent: {
        toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
        entityQuery: shortEntity,
        categoryReference: priorContext.categoryReference,
        limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
        ...(priorContext.civilRange !== undefined
          ? { civilRange: priorContext.civilRange }
          : {}),
      },
      anaphora: 'RESOLVED',
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

  const anchor = resolveNominalAnchor(prior, input.now);
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
        categoryReference: anchor.categoryReference ?? 'convenio',
        limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
        ...(anchor.civilRange !== undefined ? { civilRange: anchor.civilRange } : {}),
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
    /\b(?:desse|desta|dessa|esse|esta|essa)\s+(?:convenio|fornecedor|cliente|contraparte|empresa|parceiro|entidade)\b/.test(
      folded,
    ) || /\bquanto (?:eu )?recebi (?:desse|dessa|dele|dela)\b/.test(folded)
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

/**
 * Herda somente categoryReference (e civilRange ausente) de intenções USER anteriores.
 * Nunca lê texto do CONSULTANT.
 */
function enrichLookupWithPriorDimension(
  direct: AdvisorNominalIntent,
  priorUserContents: readonly string[],
  now: Date | undefined,
): { readonly intent: AdvisorNominalIntent; readonly inherited: boolean } {
  if (direct.toolName !== CASH_NOMINAL_LOOKUP_TOOL_NAME) {
    return { intent: direct, inherited: false };
  }
  const needsCategory = direct.categoryReference === undefined;
  const needsRange = direct.civilRange === undefined;
  if (!needsCategory && !needsRange) {
    return { intent: direct, inherited: false };
  }
  const prior = resolvePriorNominalDimensionContext(priorUserContents, now);
  if (prior === null) {
    return { intent: direct, inherited: false };
  }
  return {
    intent: {
      ...direct,
      ...(needsCategory ? { categoryReference: prior.categoryReference } : {}),
      ...(needsRange && prior.civilRange !== undefined
        ? { civilRange: prior.civilRange }
        : {}),
    },
    inherited: needsCategory,
  };
}

function resolvePriorNominalDimensionContext(
  priorUserContents: readonly string[],
  now: Date | undefined,
): {
  readonly categoryReference: string;
  readonly civilRange?: AdvisorNominalIntent['civilRange'];
} | null {
  for (let index = priorUserContents.length - 1; index >= 0; index -= 1) {
    const intent = resolveAdvisorNominalIntent(priorUserContents[index]!, { now });
    if (intent?.categoryReference === undefined) {
      continue;
    }
    return {
      categoryReference: intent.categoryReference,
      ...(intent.civilRange !== undefined ? { civilRange: intent.civilRange } : {}),
    };
  }
  return null;
}

function resolveNominalAnchor(
  priorUserContents: readonly string[],
  now: Date | undefined,
):
  | { readonly kind: 'none' }
  | {
      readonly kind: 'entity';
      readonly entityQuery: string;
      readonly categoryReference?: string;
      readonly civilRange?: AdvisorNominalIntent['civilRange'];
    }
  | {
      readonly kind: 'ranking';
      readonly question: string;
      readonly categoryReference?: string;
      readonly civilRange?: AdvisorNominalIntent['civilRange'];
    }
  | { readonly kind: 'ambiguous' } {
  for (let index = priorUserContents.length - 1; index >= 0; index -= 1) {
    const content = priorUserContents[index]!;
    const entities = extractExplicitNominalEntities(content);
    if (entities.length > 1) {
      return { kind: 'ambiguous' };
    }
    const intent = resolveAdvisorNominalIntent(content, { now });
    if (entities.length === 1) {
      return {
        kind: 'entity',
        entityQuery: entities[0]!,
        ...(intent?.categoryReference !== undefined
          ? { categoryReference: intent.categoryReference }
          : {}),
        ...(intent?.civilRange !== undefined ? { civilRange: intent.civilRange } : {}),
      };
    }
    if (intent?.toolName === CASH_NOMINAL_RANKING_TOOL_NAME) {
      return {
        kind: 'ranking',
        question: content,
        ...(intent.categoryReference !== undefined
          ? { categoryReference: intent.categoryReference }
          : {}),
        ...(intent.civilRange !== undefined ? { civilRange: intent.civilRange } : {}),
      };
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
