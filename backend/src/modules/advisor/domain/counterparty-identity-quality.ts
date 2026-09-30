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

export type CounterpartyWinnerAssessment = {
  readonly quality: CounterpartyIdentityQuality;
  readonly decision: CounterpartyQualityDecision;
  readonly reasonCode: string;
  readonly winnerName: string | null;
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

export function assessCounterpartyWinner(input: {
  readonly movements: readonly CounterpartyMovementInput[];
  readonly partyProfile: CounterpartyProfileRole;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly period: AnalyticalPeriod;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
  readonly query: AnalyticalQuery;
}): CounterpartyWinnerAssessment {
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

  const ranked = [...groups.values()].sort((left, right) => right.amount.comparedTo(left.amount));
  const top = ranked[0] ?? null;
  const tied = top !== null && ranked.filter((row) => row.amount.equals(top.amount)).length > 1;
  const unsafe = unidentifiedAmount.plus(incompatibleAmount);
  const winnerGuaranteed =
    !negative && !tied && top !== null && incompatibleCount === 0 && top.amount.gt(unsafe);

  const quality: CounterpartyIdentityQuality = {
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
    topIdentifiedAmount: top === null ? null : top.amount.toFixed(4),
    winnerGuaranteed,
  };

  const decision = decide({
    quality,
    negative,
    tied,
    incompatibleCount,
    winnerName: top?.name ?? null,
  });
  const answer = composeAnswer({
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    profile: input.partyProfile,
    winnerName: top?.name ?? null,
    winnerAmount: top?.amount ?? null,
    unidentifiedAmount,
    periodCoverage: input.periodCoverage,
  });

  return {
    quality,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    winnerName: decision.decision === 'AVAILABLE' ? (top?.name ?? null) : top?.name ?? null,
    answer,
    result: toResult({
      query: input.query,
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      answer,
      winnerName: top?.name ?? null,
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
