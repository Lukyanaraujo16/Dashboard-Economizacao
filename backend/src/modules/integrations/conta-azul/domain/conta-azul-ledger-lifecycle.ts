import { Prisma } from '../../../../generated/prisma/client.js';
import { isRecord } from './conta-azul-mapping.js';
import { ContaAzulMoneyError, parseContaAzulMoney } from './conta-azul-money.js';

export type LedgerLifecycleCounters = {
  readonly checked: number;
  readonly missingSettlement: number;
  readonly confirmedStale: number;
  readonly wouldDelete: number;
  readonly deleted: number;
  readonly upstreamEmpty: number;
  readonly overCovered: number;
  readonly underCovered: number;
  readonly reactivated: number;
  readonly failure: number;
  /** R3 hold: Σ upstream < valor_pago (tombstone causaria under_covered). */
  readonly skippedUnderCovered: number;
  /** Lista de baixas ou detalhe da parcela falhou/incompleto. */
  readonly skippedFetchFailure: number;
};

export function emptyLedgerLifecycleCounters(): LedgerLifecycleCounters {
  return {
    checked: 0,
    missingSettlement: 0,
    confirmedStale: 0,
    wouldDelete: 0,
    deleted: 0,
    upstreamEmpty: 0,
    overCovered: 0,
    underCovered: 0,
    reactivated: 0,
    failure: 0,
    skippedUnderCovered: 0,
    skippedFetchFailure: 0,
  };
}

export function addLedgerLifecycleCounters(
  left: LedgerLifecycleCounters,
  right: LedgerLifecycleCounters,
): LedgerLifecycleCounters {
  return {
    checked: left.checked + right.checked,
    missingSettlement: left.missingSettlement + right.missingSettlement,
    confirmedStale: left.confirmedStale + right.confirmedStale,
    wouldDelete: left.wouldDelete + right.wouldDelete,
    deleted: left.deleted + right.deleted,
    upstreamEmpty: left.upstreamEmpty + right.upstreamEmpty,
    overCovered: left.overCovered + right.overCovered,
    underCovered: left.underCovered + right.underCovered,
    reactivated: left.reactivated + right.reactivated,
    failure: left.failure + right.failure,
    skippedUnderCovered: left.skippedUnderCovered + right.skippedUnderCovered,
    skippedFetchFailure: left.skippedFetchFailure + right.skippedFetchFailure,
  };
}

const PAID_LIKE_STATUS = new Set(['QUITADO', 'RECEBIDO', 'PAGO', 'PAID']);

export type ParcelaIdentity =
  | { readonly kind: 'found'; readonly id: string; readonly status: string; readonly valorPago: Prisma.Decimal }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unreadable' };

export function readParcelaIdentity(payload: unknown): ParcelaIdentity {
  if (!isRecord(payload) || typeof payload.id !== 'string' || payload.id.trim() === '') {
    return { kind: 'unreadable' };
  }
  const status = typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';
  try {
    return {
      kind: 'found',
      id: payload.id.trim(),
      status,
      valorPago: parseContaAzulMoney(payload.valor_pago, 'valor_pago'),
    };
  } catch (error) {
    if (error instanceof ContaAzulMoneyError) {
      return { kind: 'unreadable' };
    }
    throw error;
  }
}

export function isCoherentPaidStatus(status: string): boolean {
  return PAID_LIKE_STATUS.has(status.trim().toUpperCase());
}

export type R3Decision = 'confirmed_stale' | 'hold';

export type R3HoldReason =
  | 'list_not_ready'
  | 'not_missing'
  | 'settlement_still_present'
  | 'settlement_lookup_error'
  | 'parcela_unreadable'
  | 'parcela_id_mismatch'
  | 'status_not_paid_like'
  | 'remaining_under_paid'
  | 'remaining_over_paid'
  | 'remaining_mismatch';

/**
 * R3: missing local ACTIVE pode virar DELETED só se todas as checagens passarem.
 * Identidade = conjunto atual de baixas da parcela + 404 no GET por id.
 * Não deduplica por valor/data/conta isoladamente.
 */
export function evaluateR3Tombstone(input: {
  readonly listOkNonEmpty: boolean;
  readonly missingFromList: boolean;
  readonly settlementLookup: 'not_found' | 'found' | 'error';
  readonly parcela: ParcelaIdentity;
  readonly remainingGross: Prisma.Decimal;
  readonly installmentExternalId: string;
}): R3Decision {
  return explainR3Tombstone(input).decision;
}

export function explainR3Tombstone(input: {
  readonly listOkNonEmpty: boolean;
  readonly missingFromList: boolean;
  readonly settlementLookup: 'not_found' | 'found' | 'error';
  readonly parcela: ParcelaIdentity;
  readonly remainingGross: Prisma.Decimal;
  readonly installmentExternalId: string;
}): { readonly decision: R3Decision; readonly holdReason: R3HoldReason | null } {
  if (!input.listOkNonEmpty || !input.missingFromList) {
    return {
      decision: 'hold',
      holdReason: !input.missingFromList ? 'not_missing' : 'list_not_ready',
    };
  }
  if (input.settlementLookup === 'found') {
    return { decision: 'hold', holdReason: 'settlement_still_present' };
  }
  if (input.settlementLookup === 'error') {
    return { decision: 'hold', holdReason: 'settlement_lookup_error' };
  }
  if (input.parcela.kind !== 'found') {
    return { decision: 'hold', holdReason: 'parcela_unreadable' };
  }
  if (input.parcela.id !== input.installmentExternalId) {
    return { decision: 'hold', holdReason: 'parcela_id_mismatch' };
  }
  if (!isCoherentPaidStatus(input.parcela.status)) {
    return { decision: 'hold', holdReason: 'status_not_paid_like' };
  }
  if (input.remainingGross.lessThan(input.parcela.valorPago)) {
    return { decision: 'hold', holdReason: 'remaining_under_paid' };
  }
  if (input.remainingGross.greaterThan(input.parcela.valorPago)) {
    return { decision: 'hold', holdReason: 'remaining_over_paid' };
  }
  if (!input.remainingGross.equals(input.parcela.valorPago)) {
    return { decision: 'hold', holdReason: 'remaining_mismatch' };
  }
  return { decision: 'confirmed_stale', holdReason: null };
}
