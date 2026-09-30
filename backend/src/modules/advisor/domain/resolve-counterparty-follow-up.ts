import type { AnalyticalQuery } from './analytical/analytical-query.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import type { AnalyticalConversationState } from './analytical-conversation-state.js';
import { resolveAdvisorCivilRange } from './resolve-advisor-civil-range.js';
import { resolveAdvisorPeriod } from './resolve-advisor-period.js';

const ORDINALS = [
  'primeiro',
  'segundo',
  'terceiro',
  'quarto',
  'quinto',
  'sexto',
  'setimo',
  'oitavo',
  'nono',
  'decimo',
] as const;

export type CounterpartyFollowUp =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'CLEAR' }
  | { readonly kind: 'ORDINAL'; readonly rank: number }
  | { readonly kind: 'QUERY'; readonly query: AnalyticalQuery };

export function resolveCounterpartyFollowUp(input: {
  readonly content: string;
  readonly state: AnalyticalConversationState | null;
  readonly now?: Date;
  readonly referenceMonthKey?: string;
}): CounterpartyFollowUp {
  const folded = foldPt(input.content);
  if (/\b(?:categorias?|centros?(?:\s+de\s+custo)?|convenios?)\b/.test(folded)) {
    return { kind: 'CLEAR' };
  }
  const ordinal = ordinalRank(folded);
  if (ordinal !== null) {
    return { kind: 'ORDINAL', rank: ordinal };
  }
  if (input.state === null) {
    return { kind: 'NONE' };
  }
  const profileSwitch = switchedProfile(folded);
  if (profileSwitch !== null) {
    return {
      kind: 'QUERY',
      query: queryFromState(input.state, {
        partyProfile: profileSwitch,
        direction: profileSwitch === 'CUSTOMER' ? 'INFLOW' : 'OUTFLOW',
        operation: rankingOperation(input.state.operation),
        identity: undefined,
      }),
    };
  }
  if (/\bquanto ele representou\b/.test(folded) || /\brepresentou das minhas\b/.test(folded)) {
    if (input.state.focusDisplayName === null) {
      return { kind: 'NONE' };
    }
    const direction = /\bentradas?\b/.test(folded)
      ? 'INFLOW'
      : /\b(?:saidas?|pagamentos?)\b/.test(folded)
        ? 'OUTFLOW'
        : input.state.direction;
    const partyProfile = direction === 'INFLOW' ? 'CUSTOMER' : 'SUPPLIER';
    if (partyProfile !== input.state.partyProfile && !/\bentradas?\b/.test(folded)) {
      return { kind: 'NONE' };
    }
    return {
      kind: 'QUERY',
      query: queryFromState(input.state, {
        partyProfile: input.state.partyProfile,
        direction: input.state.direction,
        operation: 'SHARE',
        identity: input.state.focusDisplayName,
      }),
    };
  }
  if (/\bquanto ele me pagou\b/.test(folded) || /\bquanto ele pagou\b/.test(folded)) {
    if (input.state.focusDisplayName === null) {
      return { kind: 'NONE' };
    }
    return {
      kind: 'QUERY',
      query: queryFromState(input.state, {
        partyProfile: input.state.partyProfile,
        direction: input.state.direction,
        operation: 'LOOKUP',
        identity: input.state.focusDisplayName,
      }),
    };
  }
  const named = explicitFollowUpName(input.content);
  if (named !== null) {
    return {
      kind: 'QUERY',
      query: queryFromState(input.state, {
        partyProfile: input.state.partyProfile,
        direction: input.state.direction,
        operation: 'LOOKUP',
        identity: named,
      }),
    };
  }
  const period = followUpPeriod(input);
  if (period !== null) {
    return {
      kind: 'QUERY',
      query: {
        ...queryFromState(input.state, {
          partyProfile: input.state.partyProfile,
          direction: input.state.direction,
          operation: rankingOperation(input.state.operation),
          identity: undefined,
        }),
        period,
      },
    };
  }
  return { kind: 'NONE' };
}

export function composeOrdinalAnswer(input: {
  readonly state: AnalyticalConversationState;
  readonly rank: number;
}): { readonly answer: string; readonly focusDisplayName: string | null } {
  const row = input.state.rows.find((item) => item.rank === input.rank);
  const role = input.state.partyProfile === 'CUSTOMER' ? 'clientes' : 'fornecedores';
  if (row === undefined) {
    return {
      answer: `Não há a posição ${input.rank} no ranking anterior de ${role} desta conversa.`,
      focusDisplayName: input.state.focusDisplayName,
    };
  }
  return {
    answer: `No ranking anterior dos ${role} identificados, a posição ${row.rank} é ${row.displayName}.`,
    focusDisplayName: row.displayName,
  };
}

function rankingOperation(operation: AnalyticalConversationState['operation']): 'RANKING_TOPN' | 'RANKING_WINNER' {
  return operation === 'RANKING_WINNER' ? 'RANKING_WINNER' : 'RANKING_TOPN';
}

function queryFromState(
  state: AnalyticalConversationState,
  patch: {
    readonly partyProfile: 'CUSTOMER' | 'SUPPLIER';
    readonly direction: 'INFLOW' | 'OUTFLOW';
    readonly operation: AnalyticalQuery['operation'];
    readonly identity: string | undefined;
  },
): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: patch.direction,
    period: state.period,
    dimension: 'COUNTERPARTY',
    operation: patch.operation,
    filters: { partyProfile: patch.partyProfile },
    ...(patch.identity !== undefined ? { identity: { kind: 'QUERY', query: patch.identity } } : {}),
    ...(patch.operation === 'RANKING_WINNER'
      ? { limit: 1 }
      : patch.operation === 'RANKING_TOPN'
        ? { limit: state.limit ?? 5 }
        : {}),
  };
}

function switchedProfile(folded: string): 'CUSTOMER' | 'SUPPLIER' | null {
  if (/^(?:e\s+)?(?:os\s+|as\s+)?fornecedores?\??$/.test(folded)) {
    return 'SUPPLIER';
  }
  if (/^(?:e\s+)?(?:os\s+|as\s+)?clientes?\??$/.test(folded)) {
    return 'CUSTOMER';
  }
  return null;
}

function ordinalRank(folded: string): number | null {
  const match = /^(?:e\s+)?o\s+([a-z]+)\b/.exec(folded);
  if (match === null) {
    return null;
  }
  const index = ORDINALS.indexOf(match[1] as (typeof ORDINALS)[number]);
  return index === -1 ? null : index + 1;
}

function explicitFollowUpName(content: string): string | null {
  const match = /^(?:e\s+)?(?:a|o)\s+(.+?)\??$/i.exec(content.trim());
  const raw = match?.[1]?.trim();
  if (raw === undefined || raw === '') {
    return null;
  }
  const folded = foldPt(raw);
  if (ORDINALS.includes(folded as (typeof ORDINALS)[number])) {
    return null;
  }
  if (/\b(?:julho|agosto|janeiro|fevereiro|marco|abril|maio|junho|setembro|outubro|novembro|dezembro|ano|mes)\b/.test(folded)) {
    return null;
  }
  return raw;
}

function followUpPeriod(input: {
  readonly content: string;
  readonly now?: Date;
  readonly referenceMonthKey?: string;
}): AnalyticalPeriod | null {
  const folded = foldPt(input.content);
  if (!/^(?:e\s+)?/.test(folded)) {
    return null;
  }
  const civil = resolveAdvisorCivilRange({ content: input.content, now: input.now });
  if (civil?.kind === 'YEAR') {
    return {
      kind: 'YEAR',
      year: civil.year,
      rangeKey: civil.rangeKey,
      isPartialYear: false,
      from: civil.from,
      to: civil.to,
    };
  }
  if (civil?.kind === 'YTD') {
    return {
      kind: 'YTD',
      year: civil.year,
      rangeKey: civil.rangeKey,
      from: civil.from,
      to: civil.to,
      asOf: civil.asOf,
    };
  }
  if (!/\b(?:mes\s+(?:passado|anterior)|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(folded)) {
    return null;
  }
  const month = resolveAdvisorPeriod({
    content: input.content,
    now: input.now,
    referenceMonthKey: input.referenceMonthKey,
  });
  if (month.source !== 'EXPLICIT' && month.source !== 'RELATIVE') {
    return null;
  }
  return { kind: 'MONTH', monthKey: month.monthKey };
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}
