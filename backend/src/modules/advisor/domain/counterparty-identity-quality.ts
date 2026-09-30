import { Prisma } from '../../../generated/prisma/client.js';
import { formatAdvisorFactualBrl } from './advisor-factual-display.js';
import type { AnalyticalDirection } from './analytical/analytical-keys.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import type { AnalyticalResult } from './analytical/analytical-result.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';

/**
 * Qualidade de identidade de contraparte (F13.8.5E.2).
 * Não é capability e não usa percentual mágico.
 * Completude do período é outro eixo: hoje o histórico sincronizado não a prova.
 */
export const COUNTERPARTY_PERIOD_COVERAGE_STATUSES = ['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const;
export type CounterpartyPeriodCoverageStatus =
  (typeof COUNTERPARTY_PERIOD_COVERAGE_STATUSES)[number];

export const COUNTERPARTY_QUALITY_DECISIONS = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type CounterpartyQualityDecision = (typeof COUNTERPARTY_QUALITY_DECISIONS)[number];

export type CounterpartyProfileRole = 'CUSTOMER' | 'SUPPLIER';

export type CounterpartyMovementInput = {
  readonly amount: string;
  /** false = party de outro tenant/integração, ou party ausente. Nunca entra no ranking. */
  readonly sameScope: boolean;
  readonly partyId: string | null;
  readonly displayName: string | null;
  readonly profiles: readonly ('CUSTOMER' | 'SUPPLIER' | 'CARRIER')[];
  readonly origin: 'RECEIVABLE' | 'PAYABLE' | 'MISSING';
};

export type CounterpartyIdentityQuality = {
  readonly totalMovementCount: number;
  readonly identifiedMovementCount: number;
  readonly unidentifiedMovementCount: number;
  readonly incompatibleProfileMovementCount: number;
  readonly totalAmount: string;
  readonly identifiedAmount: string;
  readonly unidentifiedAmount: string;
  readonly incompatibleProfileAmount: string;
  /** null quando não há movimentos: zero não é cobertura 100%. */
  readonly countCoverageRatio: number | null;
  readonly amountCoverageRatio: number | null;
  readonly distinctIdentifiedParties: number;
  readonly partyProfile: CounterpartyProfileRole;
  readonly direction: AnalyticalDirection;
  readonly period: AnalyticalPeriod;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
  readonly topIdentifiedAmount: string | null;
  /**
   * Verdadeiro só se um único grupo oficial supera a soma não atribuível.
   * Não prova que o período civil está completo.
   */
  readonly winnerGuaranteed: boolean;
};

export type CounterpartyResultRow = {
  readonly rank: number;
  readonly displayName: string;
  readonly amount: string;
  readonly movementCount: number;
};

export type CounterpartyWinnerAssessment = {
  readonly quality: CounterpartyIdentityQuality;
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
  readonly winnerName: string | null;
  readonly rows: readonly CounterpartyResultRow[];
  readonly focusDisplayName: string | null;
  readonly answer: string;
  readonly result: AnalyticalResult;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Não há metadado que prove o início ou o fim do histórico sincronizado.
 * last_successful_sync, primeiro movimento e último movimento não servem.
 */
export function resolveCounterpartyPeriodCoverage(): CounterpartyPeriodCoverageStatus {
  return 'UNKNOWN';
}

export type RankedCounterparty = {
  readonly partyId: string;
  readonly displayName: string;
  readonly amount: Prisma.Decimal;
  readonly movementCount: number;
};

export type CounterpartyPopulation = {
  readonly qualityBase: Omit<
    CounterpartyIdentityQuality,
    'winnerGuaranteed' | 'topIdentifiedAmount'
  >;
  readonly ranked: readonly RankedCounterparty[];
  readonly negative: boolean;
  readonly incompatibleCount: number;
  readonly unidentifiedAmount: Prisma.Decimal;
  readonly incompatibleAmount: Prisma.Decimal;
  readonly totalAmount: Prisma.Decimal;
};

export function inspectCounterpartyPopulation(input: {
  readonly movements: readonly CounterpartyMovementInput[];
  readonly partyProfile: CounterpartyProfileRole;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly period: AnalyticalPeriod;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
}): CounterpartyPopulation {
  const expectedOrigin = input.direction === 'INFLOW' ? 'RECEIVABLE' : 'PAYABLE';
  const groups = new Map<string, { amount: Prisma.Decimal; name: string; count: number }>();
  let totalCount = 0;
  let identifiedCount = 0;
  let unidentifiedCount = 0;
  let incompatibleCount = 0;
  let totalAmount = ZERO;
  let identifiedAmount = ZERO;
  let unidentifiedAmount = ZERO;
  let incompatibleAmount = ZERO;
  let negative = false;

  for (const movement of input.movements) {
    const amount = new Prisma.Decimal(movement.amount);
    if (amount.isNeg()) {
      negative = true;
    }
    totalCount += 1;
    totalAmount = totalAmount.plus(amount);
    const compatible =
      movement.sameScope &&
      movement.partyId !== null &&
      movement.origin === expectedOrigin &&
      movement.profiles.includes(input.partyProfile);
    if (compatible && movement.partyId !== null) {
      identifiedCount += 1;
      identifiedAmount = identifiedAmount.plus(amount);
      const current = groups.get(movement.partyId);
      const name = movement.displayName?.trim() || 'contraparte sem nome cadastrado';
      if (current === undefined) {
        groups.set(movement.partyId, { amount, name, count: 1 });
      } else {
        current.amount = current.amount.plus(amount);
        current.count += 1;
      }
      continue;
    }
    const hasPartyInScope =
      movement.sameScope && movement.partyId !== null && movement.origin !== 'MISSING';
    if (hasPartyInScope) {
      incompatibleCount += 1;
      incompatibleAmount = incompatibleAmount.plus(amount);
      continue;
    }
    unidentifiedCount += 1;
    unidentifiedAmount = unidentifiedAmount.plus(amount);
  }

  const rankedParties = [...groups.entries()]
    .map(([partyId, row]) => ({
      partyId,
      displayName: row.name,
      amount: row.amount,
      movementCount: row.count,
    }))
    .sort((left, right) => {
      const byAmount = right.amount.comparedTo(left.amount);
      if (byAmount !== 0) {
        return byAmount;
      }
      const byName = left.displayName.localeCompare(right.displayName, 'pt');
      if (byName !== 0) {
        return byName;
      }
      return left.partyId.localeCompare(right.partyId);
    });
  return {
    qualityBase: {
      totalMovementCount: totalCount,
      identifiedMovementCount: identifiedCount,
      unidentifiedMovementCount: unidentifiedCount,
      incompatibleProfileMovementCount: incompatibleCount,
      totalAmount: totalAmount.toFixed(4),
      identifiedAmount: identifiedAmount.toFixed(4),
      unidentifiedAmount: unidentifiedAmount.toFixed(4),
      incompatibleProfileAmount: incompatibleAmount.toFixed(4),
      countCoverageRatio: ratio(identifiedCount, totalCount),
      amountCoverageRatio: decimalRatio(identifiedAmount, totalAmount),
      distinctIdentifiedParties: groups.size,
      partyProfile: input.partyProfile,
      direction: input.direction,
      period: input.period,
      periodCoverage: input.periodCoverage,
    },
    ranked: rankedParties,
    negative,
    incompatibleCount,
    unidentifiedAmount,
    incompatibleAmount,
    totalAmount,
  };
}

export function assessCounterpartyWinner(input: {
  readonly movements: readonly CounterpartyMovementInput[];
  readonly partyProfile: CounterpartyProfileRole;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly period: AnalyticalPeriod;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
  readonly query: AnalyticalQuery;
}): CounterpartyWinnerAssessment {
  const population = inspectCounterpartyPopulation(input);
  const ranked = population.ranked;
  const top = ranked[0] ?? null;
  const tied = top !== null && ranked.filter((row) => row.amount.equals(top.amount)).length > 1;
  const unsafe = population.unidentifiedAmount.plus(population.incompatibleAmount);
  const winnerGuaranteed =
    !population.negative &&
    !tied &&
    top !== null &&
    population.incompatibleCount === 0 &&
    top.amount.gt(unsafe);

  const quality: CounterpartyIdentityQuality = {
    ...population.qualityBase,
    topIdentifiedAmount: top === null ? null : top.amount.toFixed(4),
    winnerGuaranteed,
  };

  const decision = decide({
    quality,
    negative: population.negative,
    tied,
    incompatibleCount: population.incompatibleCount,
    winnerName: top?.displayName ?? null,
  });
  const answer = composeAnswer({
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    profile: input.partyProfile,
    winnerName: top?.displayName ?? null,
    winnerAmount: top?.amount ?? null,
    unidentifiedAmount: population.unidentifiedAmount,
    periodCoverage: input.periodCoverage,
  });

  return {
    quality,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    winnerName: top?.displayName ?? null,
    rows:
      top === null
        ? []
        : [
            {
              rank: 1,
              displayName: top.displayName,
              amount: top.amount.toFixed(4),
              movementCount: top.movementCount,
            },
          ],
    focusDisplayName: tied ? null : (top?.displayName ?? null),
    answer,
    result: toResult({
      query: input.query,
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      answer,
      winnerName: top?.displayName ?? null,
      winnerAmount: top?.amount.toFixed(4) ?? null,
      quality,
    }),
  };
}

function decide(input: {
  readonly quality: CounterpartyIdentityQuality;
  readonly negative: boolean;
  readonly tied: boolean;
  readonly incompatibleCount: number;
  readonly winnerName: string | null;
}): { readonly decision: CounterpartyQualityDecision; readonly reasonCode: string } {
  if (input.negative) {
    return { decision: 'UNAVAILABLE', reasonCode: 'AMOUNT_SIGN_UNSUPPORTED' };
  }
  if (input.quality.totalMovementCount === 0) {
    if (input.quality.periodCoverage === 'COMPLETE') {
      return { decision: 'UNAVAILABLE', reasonCode: 'EMPTY_PERIOD' };
    }
    if (input.quality.periodCoverage === 'PARTIAL') {
      return { decision: 'UNAVAILABLE', reasonCode: 'PERIOD_COVERAGE_PARTIAL' };
    }
    return { decision: 'UNAVAILABLE', reasonCode: 'PERIOD_COVERAGE_UNKNOWN' };
  }
  if (input.quality.identifiedMovementCount === 0) {
    return { decision: 'UNAVAILABLE', reasonCode: 'IDENTITY_ABSENT' };
  }
  if (input.incompatibleCount > 0) {
    return { decision: 'PARTIAL', reasonCode: 'PROFILE_MISMATCH' };
  }
  if (input.tied) {
    return { decision: 'PARTIAL', reasonCode: 'WINNER_TIED' };
  }
  if (!input.quality.winnerGuaranteed) {
    return { decision: 'PARTIAL', reasonCode: 'WINNER_NOT_GUARANTEED' };
  }
  if (input.quality.periodCoverage !== 'COMPLETE') {
    return { decision: 'PARTIAL', reasonCode: 'PERIOD_COVERAGE_UNPROVEN' };
  }
  return { decision: 'AVAILABLE', reasonCode: 'WINNER_GUARANTEED' };
}

function composeAnswer(input: {
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
  readonly profile: CounterpartyProfileRole;
  readonly winnerName: string | null;
  readonly winnerAmount: Prisma.Decimal | null;
  readonly unidentifiedAmount: Prisma.Decimal;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
}): string {
  const role = input.profile === 'CUSTOMER' ? 'cliente' : 'fornecedor';
  const rolePlural = input.profile === 'CUSTOMER' ? 'clientes' : 'fornecedores';
  const flow = input.profile === 'CUSTOMER' ? 'recebimentos' : 'pagamentos';
  const money = (amount: Prisma.Decimal | null) =>
    amount === null ? null : formatAdvisorFactualBrl(amount.toFixed(2));

  if (input.reasonCode === 'PERIOD_COVERAGE_UNKNOWN' || input.reasonCode === 'PERIOD_COVERAGE_PARTIAL') {
    return 'Não consigo afirmar se houve movimentação nesse período, porque a cobertura histórica desse recorte não está comprovada.';
  }
  if (input.reasonCode === 'EMPTY_PERIOD') {
    return `Não há ${flow} realizados nesse período.`;
  }
  if (input.reasonCode === 'IDENTITY_ABSENT' || input.reasonCode === 'AMOUNT_SIGN_UNSUPPORTED') {
    return `Não há identificação oficial suficiente de ${rolePlural} nesse recorte para fechar esse ranking com segurança.`;
  }
  const winnerMoney = money(input.winnerAmount);
  const missingMoney = money(input.unidentifiedAmount);
  if (input.decision === 'AVAILABLE' && input.winnerName !== null && winnerMoney !== null) {
    const verb = input.profile === 'CUSTOMER' ? 'pagou' : 'recebeu';
    return `O ${role} ${input.winnerName} foi quem mais ${verb} nesse período, com ${winnerMoney}.`;
  }
  if (input.reasonCode === 'PERIOD_COVERAGE_UNPROVEN' && input.winnerName !== null && winnerMoney !== null) {
    return `Entre os ${rolePlural} identificados nos dados disponíveis, ${input.winnerName} aparece com ${winnerMoney}. Não consigo confirmar que o período pedido está integralmente coberto, então não fecho esse nome como o maior do período completo.`;
  }
  if (input.reasonCode === 'PROFILE_MISMATCH' && input.winnerName !== null && winnerMoney !== null) {
    return `Entre os ${rolePlural} identificados, ${input.winnerName} aparece com ${winnerMoney}. Parte dos movimentos tem papel oficial incompatível com esse recorte, então não fecho esse nome como o maior.`;
  }
  if (input.reasonCode === 'WINNER_TIED') {
    return `Há mais de um ${role} com o mesmo valor no topo dos identificados, então não há um único maior nesse recorte.`;
  }
  if (input.winnerName !== null && winnerMoney !== null && missingMoney !== null) {
    return `Entre os ${rolePlural} identificados, ${input.winnerName} aparece com ${winnerMoney}. Porém existem ${missingMoney} em ${flow} sem ${role} identificado, então não dá para afirmar com segurança que esse foi o maior do período.`;
  }
  return `Não há identificação oficial suficiente de ${rolePlural} nesse recorte para fechar esse ranking com segurança.`;
}

function toResult(input: {
  readonly query: AnalyticalQuery;
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
  readonly answer: string;
  readonly winnerName: string | null;
  readonly winnerAmount: string | null;
  readonly quality: CounterpartyIdentityQuality;
}): AnalyticalResult {
  const meta = {
    metric: input.query.metric,
    semanticFamily: input.query.semanticFamily,
    period: input.query.period,
    direction: input.query.direction,
    dimension: input.query.dimension,
    operation: input.query.operation,
  } as const;
  if (input.decision === 'UNAVAILABLE') {
    return {
      ...meta,
      status: 'UNAVAILABLE',
      reasonCode: input.reasonCode,
      messageSafe: input.answer,
    };
  }
  return {
    ...meta,
    status: input.decision,
    payload: {
      operation: 'RANKING_WINNER',
      requestedLimit: 1,
      returnedCount: input.winnerName === null ? 0 : 1,
      total: input.quality.totalAmount,
      rows:
        input.winnerName === null
          ? []
          : [
              {
                rank: 1,
                identityKey: 'counterparty',
                displayName: input.winnerName,
                amount: input.winnerAmount,
                shareOfPopulation: null,
                shareOfIdentified: null,
              },
            ],
    },
    legacyFact: {
      kind: 'COUNTERPARTY_IDENTITY_QUALITY',
      answer: input.answer,
      reasonCode: input.reasonCode,
    },
  };
}

function ratio(part: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return part / total;
}

const COUNTERPARTY_TOPN_MAX = 20;

export function assessCounterpartyOperation(input: {
  readonly movements: readonly CounterpartyMovementInput[];
  readonly partyProfile: CounterpartyProfileRole;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly period: AnalyticalPeriod;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
  readonly query: AnalyticalQuery;
}): CounterpartyWinnerAssessment {
  if (input.query.operation === 'RANKING_WINNER') {
    return assessCounterpartyWinner(input);
  }
  const population = inspectCounterpartyPopulation(input);
  const role = input.partyProfile === 'CUSTOMER' ? 'cliente' : 'fornecedor';
  const rolePlural = input.partyProfile === 'CUSTOMER' ? 'clientes' : 'fornecedores';
  const flow = input.partyProfile === 'CUSTOMER' ? 'recebimentos' : 'pagamentos';
  const empty = emptyPopulationDecision(population);
  if (empty !== null && input.query.operation !== 'LOOKUP' && input.query.operation !== 'SHARE') {
    return finish({
      population,
      query: input.query,
      decision: empty.decision,
      reasonCode: empty.reasonCode,
      answer: composeAnswer({
        decision: empty.decision,
        reasonCode: empty.reasonCode,
        profile: input.partyProfile,
        winnerName: null,
        winnerAmount: null,
        unidentifiedAmount: population.unidentifiedAmount,
        periodCoverage: input.periodCoverage,
      }),
      rows: [],
      focusDisplayName: null,
      winnerGuaranteed: false,
    });
  }

  if (input.query.operation === 'RANKING_TOPN') {
    const limit = Math.min(Math.max(input.query.limit ?? 5, 1), COUNTERPARTY_TOPN_MAX);
    const rows = population.ranked.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      displayName: row.displayName,
      amount: row.amount.toFixed(4),
      movementCount: row.movementCount,
    }));
    if (rows.length === 0) {
      const absent = { decision: 'UNAVAILABLE' as const, reasonCode: 'IDENTITY_ABSENT' };
      return finish({
        population,
        query: input.query,
        decision: absent.decision,
        reasonCode: absent.reasonCode,
        answer: `Não há identificação oficial suficiente de ${rolePlural} nesse recorte para fechar esse ranking com segurança.`,
        rows: [],
        focusDisplayName: null,
        winnerGuaranteed: false,
      });
    }
    const last = population.ranked[limit];
    const boundaryTie =
      last !== undefined && population.ranked[limit - 1]?.amount.equals(last.amount) === true;
    const identityGap =
      population.unidentifiedAmount.gt(0) || population.incompatibleCount > 0;
    const periodOpen = input.periodCoverage !== 'COMPLETE';
    const decision = identityGap || periodOpen || boundaryTie ? 'PARTIAL' : 'AVAILABLE';
    const reasonCode = identityGap
      ? 'IDENTITY_INCOMPLETE'
      : periodOpen
        ? 'PERIOD_COVERAGE_UNPROVEN'
        : boundaryTie
          ? 'TOPN_BOUNDARY_TIE'
          : 'TOPN_COMPLETE';
    const lines = rows
      .map((row) => `${row.rank}. ${row.displayName} — ${formatAdvisorFactualBrl(row.amount)}`)
      .join('\n');
    const missing = formatAdvisorFactualBrl(population.unidentifiedAmount.toFixed(2));
    const caveat = [
      identityGap
        ? `Há ${missing} em ${flow} sem ${role} identificado, então esta lista é a dos identificados e não fecha o ranking absoluto.`
        : '',
      periodOpen
        ? 'A cobertura integral do período não pode ser comprovada pelos dados sincronizados.'
        : '',
      boundaryTie
        ? 'Há empate na última posição incluída, então o corte dessa lista não é único.'
        : '',
    ]
      .filter((line) => line !== '')
      .join(' ');
    const lead =
      decision === 'AVAILABLE'
        ? `Os ${rolePlural} com maior valor nesse período são:`
        : `Nos dados disponíveis, os ${rolePlural} identificados com maior valor são:`;
    return finish({
      population,
      query: input.query,
      decision,
      reasonCode,
      answer: `${lead}\n${lines}${caveat === '' ? '' : `\n${caveat}`}`,
      rows,
      focusDisplayName: rows.length === 1 ? rows[0]!.displayName : null,
      winnerGuaranteed: false,
    });
  }

  const identityQuery = input.query.identity?.query ?? '';
  const matches = matchIdentity(population.ranked, identityQuery);
  if (matches.length === 0) {
    return finish({
      population,
      query: input.query,
      decision: 'UNAVAILABLE',
      reasonCode: 'IDENTITY_NOT_FOUND',
      answer: `Não encontrei esse ${role} nos dados disponíveis desse recorte.`,
      rows: [],
      focusDisplayName: null,
      winnerGuaranteed: false,
    });
  }
  if (matches.length > 1) {
    return finish({
      population,
      query: input.query,
      decision: 'UNAVAILABLE',
      reasonCode: 'IDENTITY_AMBIGUOUS',
      answer: `Há mais de um ${role} com esse nome nos dados disponíveis, então não escolho um.`,
      rows: [],
      focusDisplayName: null,
      winnerGuaranteed: false,
    });
  }
  const found = matches[0]!;
  const money = formatAdvisorFactualBrl(found.amount.toFixed(2));
  const periodOpen = input.periodCoverage !== 'COMPLETE';
  if (input.query.operation === 'SHARE') {
    if (population.totalAmount.lte(0)) {
      return finish({
        population,
        query: input.query,
        decision: 'UNAVAILABLE',
        reasonCode: 'EMPTY_TOTAL',
        answer: `Não há ${flow} observados nesse recorte para calcular essa participação.`,
        rows: [],
        focusDisplayName: found.displayName,
        winnerGuaranteed: false,
      });
    }
    const share = formatShare(found.amount, population.totalAmount);
    const total = formatAdvisorFactualBrl(population.totalAmount.toFixed(2));
    const decision = periodOpen ? 'PARTIAL' : 'AVAILABLE';
    const observed = `${found.displayName} representa ${share} das ${input.direction === 'INFLOW' ? 'entradas' : 'saídas'} observadas nesse recorte, com ${money} de um total de ${total}.`;
    return finish({
      population,
      query: input.query,
      decision,
      reasonCode: periodOpen ? 'PERIOD_COVERAGE_UNPROVEN' : 'SHARE_OBSERVED',
      answer: periodOpen
        ? `Nos dados disponíveis, ${observed} A cobertura integral do período não pode ser comprovada pelos dados sincronizados.`
        : observed,
      rows: [
        {
          rank: 1,
          displayName: found.displayName,
          amount: found.amount.toFixed(4),
          movementCount: found.movementCount,
        },
      ],
      focusDisplayName: found.displayName,
      winnerGuaranteed: false,
    });
  }

  const decision = periodOpen ? 'PARTIAL' : 'AVAILABLE';
  const observed = `${found.displayName} aparece com ${money} em ${flow}.`;
  return finish({
    population,
    query: input.query,
    decision,
    reasonCode: periodOpen ? 'PERIOD_COVERAGE_UNPROVEN' : 'LOOKUP_OBSERVED',
    answer: periodOpen
      ? `Nos dados disponíveis, ${observed} A cobertura integral do período não pode ser comprovada pelos dados sincronizados.`
      : `O ${role} ${found.displayName} tem ${money} em ${flow} nesse período.`,
    rows: [
      {
        rank: 1,
        displayName: found.displayName,
        amount: found.amount.toFixed(4),
        movementCount: found.movementCount,
      },
    ],
    focusDisplayName: found.displayName,
    winnerGuaranteed: false,
  });
}

function emptyPopulationDecision(population: CounterpartyPopulation): {
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
} | null {
  if (population.negative) {
    return { decision: 'UNAVAILABLE', reasonCode: 'AMOUNT_SIGN_UNSUPPORTED' };
  }
  if (population.qualityBase.totalMovementCount === 0) {
    if (population.qualityBase.periodCoverage === 'COMPLETE') {
      return { decision: 'UNAVAILABLE', reasonCode: 'EMPTY_PERIOD' };
    }
    if (population.qualityBase.periodCoverage === 'PARTIAL') {
      return { decision: 'UNAVAILABLE', reasonCode: 'PERIOD_COVERAGE_PARTIAL' };
    }
    return { decision: 'UNAVAILABLE', reasonCode: 'PERIOD_COVERAGE_UNKNOWN' };
  }
  return null;
}

function matchIdentity(
  ranked: readonly RankedCounterparty[],
  query: string,
): readonly RankedCounterparty[] {
  const needle = foldIdentity(query);
  if (needle === '') {
    return [];
  }
  return ranked.filter((row) => foldIdentity(row.displayName) === needle);
}

function foldIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatShare(part: Prisma.Decimal, total: Prisma.Decimal): string {
  return `${part.div(total).mul(100).toFixed(2).replace('.', ',')}%`;
}

function finish(input: {
  readonly population: CounterpartyPopulation;
  readonly query: AnalyticalQuery;
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
  readonly answer: string;
  readonly rows: readonly CounterpartyResultRow[];
  readonly focusDisplayName: string | null;
  readonly winnerGuaranteed: boolean;
}): CounterpartyWinnerAssessment {
  const quality: CounterpartyIdentityQuality = {
    ...input.population.qualityBase,
    topIdentifiedAmount: input.rows[0]?.amount ?? null,
    winnerGuaranteed: input.winnerGuaranteed,
  };
  const top = input.rows[0] ?? null;
  return {
    quality,
    decision: input.decision,
    reasonCode: input.reasonCode,
    winnerName: top?.displayName ?? null,
    rows: input.rows,
    focusDisplayName: input.focusDisplayName,
    answer: input.answer,
    result: toResult({
      query: input.query,
      decision: input.decision,
      reasonCode: input.reasonCode,
      answer: input.answer,
      winnerName: top?.displayName ?? null,
      winnerAmount: top?.amount ?? null,
      quality,
    }),
  };
}

function decimalRatio(part: Prisma.Decimal, total: Prisma.Decimal): number | null {
  if (total.isZero()) {
    return null;
  }
  const value = part.div(total).toNumber();
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  return value;
}
