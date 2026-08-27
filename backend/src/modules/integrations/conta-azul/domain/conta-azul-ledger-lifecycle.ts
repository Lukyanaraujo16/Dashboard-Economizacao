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

/**
 * R3: missing local ACTIVE pode virar DELETED só se todas as checagens passarem.
 */
export function evaluateR3Tombstone(input: {
  readonly listOkNonEmpty: boolean;
  readonly missingFromList: boolean;
  readonly settlementLookup: 'not_found' | 'found' | 'error';
  readonly parcela: ParcelaIdentity;
  readonly remainingGross: Prisma.Decimal;
  readonly installmentExternalId: string;
}): R3Decision {
  if (!input.listOkNonEmpty || !input.missingFromList) {
    return 'hold';
  }
  if (input.settlementLookup !== 'not_found') {
    return 'hold';
  }
  if (input.parcela.kind !== 'found') {
    return 'hold';
  }
  if (input.parcela.id !== input.installmentExternalId) {
    return 'hold';
  }
  if (!isCoherentPaidStatus(input.parcela.status)) {
    return 'hold';
  }
  if (!input.remainingGross.equals(input.parcela.valorPago)) {
    return 'hold';
  }
  return 'confirmed_stale';
}
