import { Prisma } from '../../../generated/prisma/client.js';
import type { AdvisorAnalyticalToolExecutor, AdvisorAnalyticalToolResult } from './advisor-analytical-tools.js';
import { clampAdvisorDrilldownLimit } from './advisor-cash-realized-breakdown.js';
import { CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME } from './advisor-cost-center-dimension.js';
import {
  formatAdvisorFactualBrl,
  formatAdvisorFactualMonth,
} from './advisor-factual-display.js';
import { listAdvisorMonthWindowKeys } from './advisor-question-interpretation.js';

/**
 * Lançamentos individuais de saída realizada por centro de custo numa janela de meses
 * (capability `realized_cash.cost_center.window.movements`).
 *
 * Não há fórmula nova: cada mês é o resultado oficial de `cash_cost_center_movement_lines`
 * (mesmo motor mensal, mesmo rateio CC1, mesma deduplicação por baixa). A janela só ordena
 * a união dos lançamentos já atribuídos. É o padrão dos relatórios F12: o mesmo motor
 * mensal chamado mês a mês.
 *
 * As baixas são particionadas por `occurredOn` dentro do mês civil, então um lançamento
 * nunca aparece em dois meses. O top N global está contido na união dos tops N mensais.
 *
 * Mês indisponível não é somado em silêncio: o resultado fica PARTIAL e o texto diz quais
 * meses ficaram de fora. Lançamento individual não é despesa agregada por categoria.
 */

export const COST_CENTER_MOVEMENTS_WINDOW_FACT_KIND =
  'REALIZED_CASH_COST_CENTER_MOVEMENT_LINES_WINDOW' as const;

export const COST_CENTER_MOVEMENTS_WINDOW_CAPABILITY_KEY =
  'realized_cash.cost_center.window.movements' as const;

export type CostCenterMovementsWindowStatus =
  | 'OK'
  | 'EMPTY_RESULT'
  | 'PARTIAL'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export type CostCenterMovementsMonthResult = {
  readonly monthKey: string;
  /** Payload serializado da tool mensal; null quando a tool falhou tecnicamente. */
  readonly fact: Record<string, unknown> | null;
};

type WindowLine = {
  readonly monthKey: string;
  readonly order: number;
  readonly amount: Prisma.Decimal;
  readonly occurredOnSortKey: string;
  readonly raw: Record<string, unknown>;
};

const MONTH_STATUSES = new Set(['OK', 'EMPTY_RESULT', 'NOT_FOUND', 'AMBIGUOUS', 'UNAVAILABLE']);

/**
 * Funde os resultados mensais oficiais. Pura: sem I/O, sem tenant.
 */
export function mergeCostCenterMovementsWindow(input: {
  readonly endMonthKey: string;
  readonly count: number;
  readonly direction: 'OUTFLOW' | 'INFLOW';
  readonly limit?: number;
  readonly months: readonly CostCenterMovementsMonthResult[];
}): Record<string, unknown> {
  const limits = clampAdvisorDrilldownLimit(input.limit);
  const monthKeys = listAdvisorMonthWindowKeys(input.endMonthKey, input.count);
  const byMonth = new Map(input.months.map((row) => [row.monthKey, row.fact]));
  const monthRows = monthKeys.map((monthKey) => {
    const fact = byMonth.get(monthKey) ?? null;
    const rawStatus = fact === null ? 'UNAVAILABLE' : asString(fact.status);
    const status = rawStatus !== null && MONTH_STATUSES.has(rawStatus) ? rawStatus : 'UNAVAILABLE';
    return { monthKey, fact, status };
  });

  const base = {
    factKind: COST_CENTER_MOVEMENTS_WINDOW_FACT_KIND,
    capabilityKey: COST_CENTER_MOVEMENTS_WINDOW_CAPABILITY_KEY,
    sourceTool: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
    scope: 'PERIOD',
    period: { kind: 'MONTH_WINDOW', endMonthKey: input.endMonthKey, count: input.count },
    windowMonthKeys: monthKeys,
    direction: input.direction,
    requestedLimit: limits.requestedLimit ?? limits.effectiveLimit,
    effectiveLimit: limits.effectiveLimit,
  };

  // O catálogo é do tenant, não do mês: NOT_FOUND/AMBIGUOUS em qualquer mês vale para a janela.
  const ambiguous = monthRows.find((row) => row.status === 'AMBIGUOUS');
  if (ambiguous !== undefined) {
    return {
      ...base,
      status: 'AMBIGUOUS',
      costCenter: null,
      candidates: Array.isArray(ambiguous.fact?.candidates) ? ambiguous.fact.candidates : [],
      lines: [],
      returnedCount: 0,
      hasMore: false,
      months: monthRows.map((row) => ({ monthKey: row.monthKey, status: row.status })),
    };
  }
  if (monthRows.some((row) => row.status === 'NOT_FOUND')) {
    return {
      ...base,
      status: 'NOT_FOUND',
      costCenter: null,
      lines: [],
      returnedCount: 0,
      hasMore: false,
      months: monthRows.map((row) => ({ monthKey: row.monthKey, status: row.status })),
    };
  }

  const available = monthRows.filter((row) => row.status === 'OK' || row.status === 'EMPTY_RESULT');
  const unavailable = monthRows.filter((row) => row.status === 'UNAVAILABLE');
  const costCenter =
    available.map((row) => asRecord(row.fact?.costCenter)).find((value) => value !== null) ?? null;

  const lines: WindowLine[] = [];
  let order = 0;
  let anyMonthHasMore = false;
  for (const row of available) {
    if (row.fact?.hasMore === true) {
      anyMonthHasMore = true;
    }
    const monthLines = Array.isArray(row.fact?.lines) ? row.fact.lines : [];
    for (const item of monthLines) {
      const record = asRecord(item);
      const amount = parseDecimal(asString(record?.attributedAmount));
      if (record === null || amount === null) {
        continue;
      }
      lines.push({
        monthKey: row.monthKey,
        order: order++,
        amount,
        occurredOnSortKey: civilSortKey(asString(record.occurredOn)),
        raw: record,
      });
    }
  }
  lines.sort(compareWindowLines);
  const window = lines.slice(0, limits.effectiveLimit);

  // Total do centro na janela só quando todos os meses têm atribuição oficial
  // (regra F12-D: não somar meses indisponíveis em silêncio).
  const costCenterWindowAmount =
    unavailable.length === 0
      ? sumAmounts(available.map((row) => asString(row.fact?.costCenterAmount)))
      : null;

  const status: CostCenterMovementsWindowStatus =
    available.length === 0
      ? 'UNAVAILABLE'
      : unavailable.length > 0
        ? 'PARTIAL'
        : window.length === 0
          ? 'EMPTY_RESULT'
          : 'OK';

  return {
    ...base,
    status,
    costCenter,
    resolvedCostCenter: asString(costCenter?.name) ?? 'NONE',
    costCenterWindowAmount,
    availableMonthKeys: available.map((row) => row.monthKey),
    unavailableMonthKeys: unavailable.map((row) => row.monthKey),
    months: monthRows.map((row) => ({
      monthKey: row.monthKey,
      status: row.status,
      costCenterAmount: asString(row.fact?.costCenterAmount),
      coveragePercentage: asString(row.fact?.coveragePercentage),
    })),
    returnedCount: window.length,
    hasMore: lines.length > window.length || anyMonthHasMore,
    lines: window.map((line) => ({ monthKey: line.monthKey, ...line.raw })),
  };
}

/**
 * Executa a janela pela tool oficial mensal (bind de mês pelo backend, nunca pelo modelo).
 */
export async function runCostCenterMovementsWindow(input: {
  readonly analyticalTools: AdvisorAnalyticalToolExecutor;
  readonly tenantId: string;
  readonly now?: Date;
  readonly endMonthKey: string;
  readonly count: number;
  readonly direction: 'OUTFLOW';
  readonly costCenterQuery: string;
  readonly limit: number;
}): Promise<{
  readonly fact: Record<string, unknown>;
  readonly toolResults: readonly AdvisorAnalyticalToolResult[];
}> {
  const monthKeys = listAdvisorMonthWindowKeys(input.endMonthKey, input.count);
  const toolResults: AdvisorAnalyticalToolResult[] = [];
  const months: CostCenterMovementsMonthResult[] = [];
  for (const monthKey of monthKeys) {
    const result = await input.analyticalTools.execute({
      tenantId: input.tenantId,
      resolvedMonthKey: monthKey,
      now: input.now,
      call: {
        id: `cc-movements-window-${monthKey}`,
        name: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
        arguments: {
          monthKey,
          direction: input.direction,
          costCenterQuery: input.costCenterQuery,
          limit: input.limit,
        },
      },
    });
    toolResults.push(result);
    months.push({ monthKey, fact: result.ok ? parseFact(result.content) : null });
    const status = months[months.length - 1]?.fact?.status;
    // Entidade inexistente/ambígua vale para todos os meses: não repete a consulta.
    if (status === 'NOT_FOUND' || status === 'AMBIGUOUS') {
      break;
    }
  }
  return {
    fact: mergeCostCenterMovementsWindow({
      endMonthKey: input.endMonthKey,
      count: input.count,
      direction: input.direction,
      limit: input.limit,
      months,
    }),
    toolResults,
  };
}

/**
 * Texto factual da janela. null quando o fato não sustenta uma resposta
 * (o chamador trata NOT_FOUND/AMBIGUOUS/UNAVAILABLE).
 */
export function composeCostCenterMovementsWindowAnswer(
  fact: Record<string, unknown>,
): string | null {
  const status = asString(fact.status);
  if (status !== 'OK' && status !== 'EMPTY_RESULT' && status !== 'PARTIAL') {
    return null;
  }
  const name = asString(asRecord(fact.costCenter)?.name);
  const monthKeys = Array.isArray(fact.windowMonthKeys)
    ? fact.windowMonthKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const first = formatAdvisorFactualMonth(monthKeys[0] ?? '');
  const last = formatAdvisorFactualMonth(monthKeys[monthKeys.length - 1] ?? '');
  if (name === null || first === null || last === null) {
    return null;
  }
  const windowLabel =
    monthKeys.length === 1 ? `em ${last}` : `entre ${first} e ${last} (${monthKeys.length} meses)`;
  const unavailable = Array.isArray(fact.unavailableMonthKeys)
    ? fact.unavailableMonthKeys
        .map((key) => (typeof key === 'string' ? formatAdvisorFactualMonth(key) : null))
        .filter((label): label is string => label !== null)
    : [];
  const partialNote =
    status === 'PARTIAL' && unavailable.length > 0
      ? ` Atenção: ${joinLabels(unavailable)} ${unavailable.length === 1 ? 'não tem' : 'não têm'} atribuição oficial de saídas por centro disponível e ${unavailable.length === 1 ? 'ficou' : 'ficaram'} fora da busca; o resultado considera só os demais meses.`
      : '';
  const lines = Array.isArray(fact.lines) ? fact.lines : [];
  if (lines.length === 0) {
    return `Não há saídas realizadas atribuídas a ${name} ${windowLabel}.${partialNote}`;
  }
  const requestedLimit =
    typeof fact.requestedLimit === 'number' && Number.isInteger(fact.requestedLimit)
      ? fact.requestedLimit
      : null;
  if (requestedLimit === 1) {
    const item = asRecord(lines[0]);
    const described = describeLine(item);
    if (described === null) {
      return null;
    }
    return `O maior gasto individual (saída realizada de caixa) de ${name} ${windowLabel} foi ${described.amount}${described.suffix}.${described.allocationNote}${partialNote}`;
  }
  const listed: string[] = [];
  for (const [index, row] of lines.entries()) {
    const described = describeLine(asRecord(row));
    if (described === null) {
      return null;
    }
    listed.push(`${index + 1}. ${described.label}${described.when}: ${described.amount}${described.allocationMark}`);
  }
  const hasMore = fact.hasMore === true;
  const header = hasMore
    ? `Os ${listed.length} maiores gastos individuais (saídas realizadas de caixa) de ${name} ${windowLabel} foram:`
    : `Os gastos individuais (saídas realizadas de caixa) de ${name} ${windowLabel} foram:`;
  const allocationFootnote = lines.some((row) => isPartialAllocation(asRecord(row)))
    ? '\n* Valor atribuído ao centro pelo rateio oficial; a baixa total foi maior.'
    : '';
  return `${header}\n${listed.join('\n')}.${allocationFootnote}${partialNote}`;
}

function describeLine(item: Record<string, unknown> | null): {
  readonly amount: string;
  readonly suffix: string;
  readonly label: string;
  readonly when: string;
  readonly allocationNote: string;
  readonly allocationMark: string;
} | null {
  const amount = formatAdvisorFactualBrl(asString(item?.attributedAmount) ?? '');
  if (item === null || amount === null) {
    return null;
  }
  const date = asString(item.occurredOn);
  const description = asString(item.description);
  const party = asString(item.partyName);
  const parts = [description, party].filter((part): part is string => part !== null);
  const referent = parts.length === 0 ? null : `referente a ${parts.join(' — ')}`;
  const when = date === null ? null : `em ${date}`;
  const extras = [referent, when].filter((part): part is string => part !== null);
  const original = formatAdvisorFactualBrl(asString(item.originalSettlementAmount) ?? '');
  const partial = isPartialAllocation(item);
  return {
    amount,
    suffix: extras.length === 0 ? '' : `, ${extras.join(', ')}`,
    label: parts.length === 0 ? 'saída realizada' : parts.join(' — '),
    when: date === null ? '' : ` (${date})`,
    allocationNote:
      partial && original !== null
        ? ` Esse é o valor atribuído ao centro pelo rateio oficial; a baixa total foi ${original}.`
        : '',
    allocationMark: partial ? '*' : '',
  };
}

function isPartialAllocation(item: Record<string, unknown> | null): boolean {
  const attributed = parseDecimal(asString(item?.attributedAmount));
  const original = parseDecimal(asString(item?.originalSettlementAmount));
  return attributed !== null && original !== null && original.greaterThan(attributed);
}

function compareWindowLines(left: WindowLine, right: WindowLine): number {
  const byAmount = right.amount.comparedTo(left.amount);
  if (byAmount !== 0) {
    return byAmount;
  }
  const byDate = right.occurredOnSortKey.localeCompare(left.occurredOnSortKey);
  if (byDate !== 0) {
    return byDate;
  }
  return left.order - right.order;
}

/** "dd/mm/aaaa" → "aaaa-mm-dd" para desempate estável por data. */
function civilSortKey(value: string | null): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
  return match === null ? '' : `${match[3]}-${match[2]}-${match[1]}`;
}

function sumAmounts(values: readonly (string | null)[]): string | null {
  let total = new Prisma.Decimal(0);
  for (const value of values) {
    const parsed = parseDecimal(value);
    if (parsed === null) {
      return null;
    }
    total = total.plus(parsed);
  }
  return total.toFixed(2);
}

function parseDecimal(value: string | null): Prisma.Decimal | null {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return null;
  }
  return new Prisma.Decimal(value.trim());
}

function parseFact(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
