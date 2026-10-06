import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import type { AdvisorCostCenterCatalogItem } from './advisor-cost-center-dimension.js';
import { resolveAdvisorCostCenterQuery } from './advisor-cost-center-dimension.js';
import { extractAdvisorCostCenterMention } from './resolve-advisor-conversational-cost-center.js';

/**
 * Escopo explícito da pergunta do usuário (não é filtro automático da UI).
 * Provenance: texto → resolução tenant-scoped. Sem IDs inventados.
 */
export const ADVISOR_ENTITY_SCOPES = ['TENANT', 'COST_CENTER'] as const;
export type AdvisorEntityScope = (typeof ADVISOR_ENTITY_SCOPES)[number];

export type ExplicitCostCenterScope =
  | { readonly status: 'ABSENT' }
  | {
      readonly status: 'FOUND';
      readonly query: string;
      readonly resolvedName: string;
      readonly costCenterId: string;
    }
  | {
      readonly status: 'AMBIGUOUS';
      readonly query: string;
      readonly candidates: readonly { readonly name: string; readonly code: string | null }[];
    };

export type AdvisorQuestionAnalyticalDemand = {
  readonly explicitCostCenter: ExplicitCostCenterScope;
  readonly wantsOutflow: boolean;
  readonly wantsInflow: boolean;
  readonly wantsComparison: boolean;
  /** Pedido adicional de composição/explicação além de um agregado fechado. */
  readonly wantsCompositionOrDriver: boolean;
  readonly wantsOpenInvestigation: boolean;
};

export type DeterministicPathCapability = {
  readonly intentKind: string;
  readonly entityScope: AdvisorEntityScope;
  readonly metricFamily: 'BILLING' | 'REALIZED_CASH' | 'NOMINAL' | 'COST_CENTER' | 'SNAPSHOT' | 'LIMITATION';
  readonly operations: ReadonlySet<string>;
};

const STOP_NAME_TOKENS = new Set([
  'clinica',
  'clinic',
  'life',
  'centro',
  'centros',
  'custo',
  'unidade',
  'filial',
  'matriz',
]);

/**
 * Detecta se a pergunta referencia um centro de custo do catálogo do tenant.
 * Match por nome completo, código ou token distintivo (>=4 chars, sem stopwords).
 */
export function detectExplicitCostCenterScope(
  content: string,
  catalog: readonly AdvisorCostCenterCatalogItem[],
): ExplicitCostCenterScope {
  if (catalog.length === 0) {
    return { status: 'ABSENT' };
  }

  const mention = extractAdvisorCostCenterMention(content);
  if (mention !== null && mention !== 'AMBIGUOUS') {
    const resolved = resolveAdvisorCostCenterQuery(catalog, mention);
    if (resolved.status === 'FOUND') {
      return {
        status: 'FOUND',
        query: mention,
        resolvedName: resolved.center.name,
        costCenterId: resolved.center.costCenterId,
      };
    }
    if (resolved.status === 'AMBIGUOUS') {
      return {
        status: 'AMBIGUOUS',
        query: mention,
        candidates: resolved.candidates.map((row) => ({ name: row.name, code: row.code })),
      };
    }
  }

  const foldedQuestion = foldAdvisorNominalText(content);
  const hits: Array<{
    readonly center: AdvisorCostCenterCatalogItem;
    readonly query: string;
  }> = [];

  for (const center of catalog) {
    const foldedName = foldAdvisorNominalText(center.name);
    const foldedCode = center.code === null ? '' : foldAdvisorNominalText(center.code);
    if (foldedName !== '' && foldedQuestion.includes(foldedName)) {
      hits.push({ center, query: center.name });
      continue;
    }
    if (foldedCode !== '' && hasWholeToken(foldedQuestion, foldedCode)) {
      hits.push({ center, query: center.code ?? center.name });
      continue;
    }
    const token = distinctiveNameToken(foldedName);
    if (token !== null && hasWholeToken(foldedQuestion, token)) {
      hits.push({ center, query: token });
    }
  }

  const uniqueIds = [...new Set(hits.map((hit) => hit.center.id))];
  if (uniqueIds.length === 0) {
    // Tentativa via spans estruturais ("em X", sujeito antes de verbo financeiro).
    for (const span of extractStructuralEntitySpans(content)) {
      const resolved = resolveAdvisorCostCenterQuery(catalog, span);
      if (resolved.status === 'FOUND') {
        return {
          status: 'FOUND',
          query: span,
          resolvedName: resolved.center.name,
          costCenterId: resolved.center.costCenterId,
        };
      }
      if (resolved.status === 'AMBIGUOUS') {
        return {
          status: 'AMBIGUOUS',
          query: span,
          candidates: resolved.candidates.map((row) => ({ name: row.name, code: row.code })),
        };
      }
    }
    return { status: 'ABSENT' };
  }
  if (uniqueIds.length > 1) {
    const first = hits[0]!;
    return {
      status: 'AMBIGUOUS',
      query: first.query,
      candidates: hits.map((hit) => ({
        name: hit.center.name,
        code: hit.center.code,
      })),
    };
  }
  const hit = hits[0]!;
  return {
    status: 'FOUND',
    query: hit.query,
    resolvedName: hit.center.name,
    costCenterId: hit.center.id,
  };
}

export function deriveQuestionAnalyticalDemand(input: {
  readonly content: string;
  readonly comparison: boolean;
  readonly catalog?: readonly AdvisorCostCenterCatalogItem[];
}): AdvisorQuestionAnalyticalDemand {
  const folded = foldAdvisorNominalText(input.content);
  const explicitCostCenter = detectExplicitCostCenterScope(
    input.content,
    input.catalog ?? [],
  );
  const wantsOutflow =
    /\b(saidas?|gastos?|despesas?|pagamentos?|desembolsos?|consumiu caixa|gastou)\b/.test(
      folded,
    );
  const wantsInflow =
    /\b(entradas?|recebimentos?|faturamento|receitas?)\b/.test(folded) && !wantsOutflow;
  const wantsCompositionOrDriver =
    /\be o que\b/.test(folded) ||
    (/\be qual\b/.test(folded) &&
      /\b(categor|composi|natureza|concentrou|explica|diferenc|saidas?|gastos?)\b/.test(
        folded,
      )) ||
    (input.content.match(/\?/g) ?? []).length >= 2 ||
    (/\bcategor/.test(folded) &&
      /\b(compar|diferenc|mais (?:do )?que|do que)\b/.test(folded)) ||
    /\b(composi[cç][aã]o|distribu|ranking de categor|top\s*\d+\s+categor)\b/.test(folded) ||
    (/\b(explica|concentrou)\b/.test(folded) &&
      /\b(compar|diferenc|mais (?:do )?que|do que|entre)\b/.test(folded));
  // Investigação aberta: interrogativo + domínio financeiro, sem ranking fechado.
  // Não usa frases coloquiais literais de homologação.
  const wantsOpenInvestigation =
    /^(?:o que|como|por que|porque)\b/.test(folded) &&
    (wantsOutflow ||
      wantsInflow ||
      /\b(caixa|resultado|moviment|categor|saidas?|gastos?)\b/.test(folded)) &&
    !/\b(?:maior|menores?|top\s*\d+|ranking)\b/.test(folded);

  return {
    explicitCostCenter,
    wantsOutflow,
    wantsInflow,
    wantsComparison: input.comparison,
    wantsCompositionOrDriver,
    wantsOpenInvestigation,
  };
}

/**
 * Um path determinístico só finaliza quando cobre métrica, escopo, dimensão e
 * composição pedidos. Caso contrário, a pergunta segue para o agente.
 */
export function canDeterministicPathFullyAnswer(input: {
  readonly demand: AdvisorQuestionAnalyticalDemand;
  readonly path: DeterministicPathCapability;
}): boolean {
  const { demand, path } = input;

  if (path.metricFamily === 'LIMITATION') {
    // Limitação nominal/CC só é terminal se a pergunta era realmente daquela autoridade.
    if (path.intentKind === 'FACTUAL_LIMITATION') {
      if (demand.explicitCostCenter.status !== 'ABSENT') {
        return false;
      }
      if (demand.wantsOutflow || demand.wantsCompositionOrDriver || demand.wantsOpenInvestigation) {
        return false;
      }
      if (demand.wantsComparison) {
        return false;
      }
    }
    return true;
  }

  if (demand.explicitCostCenter.status === 'FOUND' || demand.explicitCostCenter.status === 'AMBIGUOUS') {
    if (path.entityScope !== 'COST_CENTER') {
      return false;
    }
  }

  if (demand.wantsCompositionOrDriver && !path.operations.has('COMPOSITION') && !path.operations.has('BREAKDOWN') && !path.operations.has('MOVEMENTS')) {
    if (path.operations.has('COMPARE') && !path.operations.has('COMPOSITION')) {
      return false;
    }
  }

  if (demand.wantsOpenInvestigation && path.operations.has('COMPARE') && path.operations.size === 1) {
    return false;
  }

  if (demand.wantsOutflow && path.metricFamily === 'BILLING') {
    return false;
  }

  return true;
}

export function deterministicPathCapabilityFromComposer(input: {
  readonly intentKind: string;
  readonly toolName: string | null;
  readonly hasCostCenterInFacts: boolean;
}): DeterministicPathCapability {
  const intentKind = input.intentKind;
  if (intentKind === 'FACTUAL_LIMITATION') {
    return {
      intentKind,
      entityScope: 'TENANT',
      metricFamily: 'LIMITATION',
      operations: new Set(['LIMITATION']),
    };
  }
  if (intentKind === 'MONTHLY_COMPARISON' || intentKind === 'MONTHLY_BILLING_WINNER') {
    return {
      intentKind,
      entityScope: 'TENANT',
      metricFamily: 'BILLING',
      operations: new Set(['COMPARE']),
    };
  }
  if (intentKind.startsWith('COST_CENTER_')) {
    const operations = new Set<string>(['LOOKUP']);
    if (intentKind === 'COST_CENTER_COMPARE') {
      operations.add('COMPARE');
    }
    if (intentKind === 'COST_CENTER_MOVEMENT_LINES') {
      operations.add('MOVEMENTS');
    }
    if (intentKind.includes('RANKING')) {
      operations.add('RANKING');
    }
    return {
      intentKind,
      entityScope: 'COST_CENTER',
      metricFamily: 'COST_CENTER',
      operations,
    };
  }
  if (intentKind === 'CATEGORY_BREAKDOWN') {
    return {
      intentKind,
      entityScope: input.hasCostCenterInFacts ? 'COST_CENTER' : 'TENANT',
      metricFamily: 'REALIZED_CASH',
      operations: new Set(['BREAKDOWN', 'COMPOSITION']),
    };
  }
  if (intentKind === 'CASH_MOVEMENT_LINES') {
    return {
      intentKind,
      entityScope: input.hasCostCenterInFacts ? 'COST_CENTER' : 'TENANT',
      metricFamily: 'REALIZED_CASH',
      operations: new Set(['MOVEMENTS']),
    };
  }
  if (intentKind.startsWith('SNAPSHOT_')) {
    return {
      intentKind,
      entityScope: 'TENANT',
      metricFamily: 'SNAPSHOT',
      operations: new Set(['SNAPSHOT']),
    };
  }
  if (
    intentKind === 'RANKING_WINNER' ||
    intentKind === 'RANKING_TOPN' ||
    intentKind === 'RANKING_SHARE' ||
    intentKind === 'LOOKUP' ||
    intentKind === 'COMPARISON' ||
    intentKind === 'IDENTITY_AMBIGUITY'
  ) {
    return {
      intentKind,
      entityScope: 'TENANT',
      metricFamily: 'NOMINAL',
      operations: new Set(['LOOKUP', 'RANKING', 'COMPARE']),
    };
  }
  return {
    intentKind,
    entityScope: 'TENANT',
    metricFamily: 'REALIZED_CASH',
    operations: new Set(['UNKNOWN']),
  };
}

export function toolsSupportingCostCenterQuery(): ReadonlySet<string> {
  return new Set([
    'cash_realized_breakdown',
    'cash_cost_center_lookup',
    'cash_result_cost_center_lookup',
    'compare_cash_cost_center',
    'cash_cost_center_movement_lines',
  ]);
}

function distinctiveNameToken(foldedName: string): string | null {
  const tokens = foldedName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_NAME_TOKENS.has(token));
  if (tokens.length === 0) {
    return null;
  }
  // Prefer the longest distinctive token (ex.: "laranjeiras" em "clinica life laranjeiras").
  return tokens.sort((a, b) => b.length - a.length)[0] ?? null;
}

function hasWholeToken(haystack: string, token: string): boolean {
  if (token === '') {
    return false;
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(` ${haystack} `);
}

function extractStructuralEntitySpans(content: string): string[] {
  const spans: string[] = [];
  const patterns = [
    /\bem\s+([A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,40}(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,40}){0,3})(?=\s+(?:em|de|do|da|no|na|entre|para|por|[?.!,]|$))/gi,
    /^([A-Za-zÀ-ÿ][\wÀ-ÿ-]{2,40})\s+(?:gastou|consumiu|teve|representou|apresentou)/i,
    /\b(?:saidas?|gastos?|despesas?|entradas?)\s+de\s+([A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,40}(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,40}){0,3})\s+em\b/i,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const span = match[1]?.trim();
      if (span !== undefined && span.length >= 3) {
        spans.push(span);
      }
    }
  }
  return [...new Set(spans)];
}
