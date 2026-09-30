import {
  formatAdvisorFactualBrl,
  formatAdvisorFactualMonth,
  formatAdvisorFactualPercent,
} from '../advisor-factual-display.js';
import {
  ADVISOR_BREAKDOWN_FACT_KIND,
  ADVISOR_MOVEMENT_FACT_KIND,
} from '../advisor-drilldown-fact-contract.js';

/**
 * Compositor factual genérico (F13.8.5C).
 * Não calcula KPIs, não acessa banco e não escolhe capability.
 * Nesta fase cobre CATEGORY_BREAKDOWN e CASH_MOVEMENT_LINES a partir do fact legado.
 */
export type ComposeAnalyticalFactualInput = {
  readonly intentKind: 'CATEGORY_BREAKDOWN' | 'CASH_MOVEMENT_LINES' | 'FACTUAL_LIMITATION';
  readonly facts: Record<string, unknown>;
};

export type ComposeAnalyticalFactualResult =
  | { readonly status: 'COMPOSED'; readonly text: string }
  | { readonly status: 'NOT_COMPOSABLE'; readonly reason: string };

export function composeAnalyticalFactualAnswer(
  input: ComposeAnalyticalFactualInput,
): ComposeAnalyticalFactualResult {
  if (input.intentKind === 'CATEGORY_BREAKDOWN') {
    return composeCategoryBreakdown(input.facts);
  }
  if (input.intentKind === 'CASH_MOVEMENT_LINES') {
    return composeCashMovementLines(input.facts);
  }
  if (input.intentKind === 'FACTUAL_LIMITATION') {
    return composeDrilldownLimitation(input.facts);
  }
  return { status: 'NOT_COMPOSABLE', reason: 'UNSUPPORTED_OPERATION' };
}

function composeCategoryBreakdown(
  facts: Record<string, unknown>,
): ComposeAnalyticalFactualResult {
  if (facts.factKind !== ADVISOR_BREAKDOWN_FACT_KIND) {
    return { status: 'NOT_COMPOSABLE', reason: 'FACT_KIND_MISMATCH' };
  }
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const direction = directionLabel(asString(facts.direction));
  if (month === null || direction === null) {
    return { status: 'NOT_COMPOSABLE', reason: 'INSUFFICIENT_PERIOD_OR_DIRECTION' };
  }
  if (facts.status === 'EMPTY_RESULT' || !Array.isArray(facts.categories) || facts.categories.length === 0) {
    return {
      status: 'COMPOSED',
      text: `Em ${month}, não há categorias com ${direction} neste recorte.`,
    };
  }
  const total = formatAdvisorFactualBrl(asString(facts.totalRealized) ?? '');
  if (total === null) {
    return { status: 'NOT_COMPOSABLE', reason: 'MISSING_TOTAL' };
  }
  const lines: string[] = [];
  for (const row of facts.categories) {
    const item = asRecord(row);
    const label = asString(item?.label);
    const amount = formatAdvisorFactualBrl(asString(item?.amount) ?? '');
    const shareRaw = asString(item?.sharePercent);
    const share =
      shareRaw === null || shareRaw === 'NOT_APPLICABLE'
        ? null
        : formatAdvisorFactualPercent(shareRaw);
    if (label === null || amount === null) {
      return { status: 'NOT_COMPOSABLE', reason: 'INCOMPLETE_CATEGORY_ROW' };
    }
    lines.push(
      share === null
        ? `${lines.length + 1}. ${label} — ${amount}`
        : `${lines.length + 1}. ${label} — ${amount} (${share})`,
    );
  }
  const hasMore = facts.hasMore === true;
  const header = `Em ${month}, as maiores categorias de ${direction} foram:`;
  const totalLine = `O total realizado foi ${total}.`;
  const more = hasMore
    ? ' A lista mostra apenas o recorte solicitado; existem outras categorias além destas.'
    : '';
  return {
    status: 'COMPOSED',
    text: `${header}\n${lines.join('\n')}\n${totalLine}${more}`,
  };
}

function composeCashMovementLines(
  facts: Record<string, unknown>,
): ComposeAnalyticalFactualResult {
  if (facts.factKind !== ADVISOR_MOVEMENT_FACT_KIND) {
    return { status: 'NOT_COMPOSABLE', reason: 'FACT_KIND_MISMATCH' };
  }
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const direction = directionLabel(asString(facts.direction));
  if (month === null || direction === null) {
    return { status: 'NOT_COMPOSABLE', reason: 'INSUFFICIENT_PERIOD_OR_DIRECTION' };
  }
  const linesRaw = Array.isArray(facts.lines) ? facts.lines : null;
  if (linesRaw === null) {
    return { status: 'NOT_COMPOSABLE', reason: 'MISSING_LINES' };
  }
  if (facts.status === 'EMPTY_RESULT' || linesRaw.length === 0) {
    return {
      status: 'COMPOSED',
      text: `Em ${month}, não há movimentações individuais de ${direction} neste recorte.`,
    };
  }
  const listed: string[] = [];
  for (const row of linesRaw) {
    const item = asRecord(row);
    const amount = formatAdvisorFactualBrl(asString(item?.amount) ?? '');
    if (amount === null) {
      return { status: 'NOT_COMPOSABLE', reason: 'INCOMPLETE_MOVEMENT_ROW' };
    }
    const date = asString(item?.date);
    const description = asString(item?.description);
    const party = asString(item?.partyName);
    const label = [description, party].filter((part): part is string => part !== null).join(' — ');
    const when = date === null || date === 'ABSENT' ? '' : `${date} — `;
    listed.push(`${listed.length + 1}. ${when}${label === '' ? 'lançamento' : label}: ${amount}`);
  }
  const hasMore = facts.hasMore === true;
  const header = `Em ${month}, os maiores lançamentos de ${direction} foram:`;
  const caveat =
    ' Esta é uma janela limitada de movimentações individuais, não um ranking de clientes, fornecedores ou convênios.';
  const more = hasMore ? ' Há mais lançamentos além deste recorte.' : '';
  return {
    status: 'COMPOSED',
    text: `${header}\n${listed.join('\n')}\n${caveat.trim()}${more}`,
  };
}

function composeDrilldownLimitation(
  facts: Record<string, unknown>,
): ComposeAnalyticalFactualResult {
  const factKind = asString(facts.factKind);
  if (factKind !== ADVISOR_BREAKDOWN_FACT_KIND && factKind !== ADVISOR_MOVEMENT_FACT_KIND) {
    return { status: 'NOT_COMPOSABLE', reason: 'NOT_DRILLDOWN_LIMITATION' };
  }
  const status = asString(facts.status);
  if (status === 'AMBIGUOUS') {
    return {
      status: 'COMPOSED',
      text: 'Há ambiguidade nos fatos oficiais e não é seguro escolher um resultado.',
    };
  }
  if (status === 'UNAVAILABLE' || status === 'ABSENT') {
    return {
      status: 'COMPOSED',
      text: 'Não há dado oficial suficiente para responder esta consulta de caixa realizado.',
    };
  }
  return { status: 'NOT_COMPOSABLE', reason: 'LIMITATION_NOT_MAPPED' };
}

function directionLabel(direction: string | null): string | null {
  if (direction === 'INFLOW') {
    return 'entradas realizadas de caixa';
  }
  if (direction === 'OUTFLOW') {
    return 'saídas realizadas de caixa';
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
