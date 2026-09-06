import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  evaluateR3Tombstone,
  evaluateR4bOrphan,
  explainR3Tombstone,
  isCoherentPaidStatus,
  readParcelaIdentity,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-lifecycle.js';
import {
  LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS,
  MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger.js';

describe('evaluateR3Tombstone', () => {
  const paid = new Prisma.Decimal('37593.68');
  const base = {
    listOkNonEmpty: true,
    missingFromList: true,
    settlementLookup: 'not_found' as const,
    parcela: {
      kind: 'found' as const,
      id: 'parcela-1',
      status: 'QUITADO',
      valorPago: paid,
    },
    remainingGross: paid,
    installmentExternalId: 'parcela-1',
  };

  it('confirma stale quando todas as checagens R3 passam', () => {
    expect(evaluateR3Tombstone(base)).toBe('confirmed_stale');
  });

  it('L19 — remaining gross ≠ valor_pago não tombstona', () => {
    expect(
      evaluateR3Tombstone({
        ...base,
        remainingGross: paid.add(paid),
      }),
    ).toBe('hold');
  });

  it('10-C — remaining < valor_pago é under_covered (hold)', () => {
    expect(
      explainR3Tombstone({
        ...base,
        remainingGross: paid.div(2),
      }),
    ).toEqual({ decision: 'hold', holdReason: 'remaining_under_paid' });
  });

  it('L20 — GET settlement 200 não tombstona', () => {
    expect(evaluateR3Tombstone({ ...base, settlementLookup: 'found' })).toBe('hold');
  });

  it('L21 — parcela 404 não tombstona', () => {
    expect(evaluateR3Tombstone({ ...base, parcela: { kind: 'not_found' } })).toBe('hold');
  });

  it('R4 — lista vazia não é R3', () => {
    expect(evaluateR3Tombstone({ ...base, listOkNonEmpty: false })).toBe('hold');
  });
});

describe('evaluateR4bOrphan (Correção 10-F)', () => {
  const orphanBase = {
    listOk: true,
    listWasEmpty: true,
    hasActiveLocals: true,
    settlementLookups: ['not_found'] as const,
    parcela: 'not_found' as const,
  };

  it('A — [] + settlement 404 + installment 404 => confirmed_orphan', () => {
    expect(evaluateR4bOrphan(orphanBase)).toEqual({
      decision: 'confirmed_orphan',
      holdReason: null,
    });
  });

  it('B — [] + settlement 404 + installment found => HOLD', () => {
    expect(evaluateR4bOrphan({ ...orphanBase, parcela: 'found' })).toEqual({
      decision: 'hold',
      holdReason: 'parcela_still_present',
    });
  });

  it('C — [] + settlement found + installment 404 => HOLD', () => {
    expect(
      evaluateR4bOrphan({
        ...orphanBase,
        settlementLookups: ['found'],
        parcela: 'not_found',
      }),
    ).toEqual({ decision: 'hold', holdReason: 'settlement_still_present' });
  });

  it('D/E — settlement lookup error => HOLD', () => {
    expect(
      evaluateR4bOrphan({
        ...orphanBase,
        settlementLookups: ['error'],
      }),
    ).toEqual({ decision: 'hold', holdReason: 'settlement_lookup_error' });
  });

  it('F — parcela lookup error => HOLD', () => {
    expect(evaluateR4bOrphan({ ...orphanBase, parcela: 'error' })).toEqual({
      decision: 'hold',
      holdReason: 'parcela_lookup_error',
    });
  });

  it('G — listOk=false => HOLD', () => {
    expect(evaluateR4bOrphan({ ...orphanBase, listOk: false })).toEqual({
      decision: 'hold',
      holdReason: 'list_not_ready',
    });
  });

  it('H — lista [] sozinha (sem lookups) => HOLD', () => {
    expect(
      evaluateR4bOrphan({
        listOk: true,
        listWasEmpty: true,
        hasActiveLocals: false,
        settlementLookups: [],
        parcela: 'not_found',
      }),
    ).toEqual({ decision: 'hold', holdReason: 'no_active_locals' });
  });

  it('I — múltiplos ACTIVE todos not_found + parcela 404 => orphan', () => {
    expect(
      evaluateR4bOrphan({
        ...orphanBase,
        settlementLookups: ['not_found', 'not_found'],
      }),
    ).toEqual({ decision: 'confirmed_orphan', holdReason: null });
  });

  it('J — um settlement found entre vários => HOLD', () => {
    expect(
      evaluateR4bOrphan({
        ...orphanBase,
        settlementLookups: ['not_found', 'found'],
      }),
    ).toEqual({ decision: 'hold', holdReason: 'settlement_still_present' });
  });

  it('Z — idade não participa da assinatura de decisão R4b', () => {
    const keys = Object.keys(orphanBase).sort();
    expect(keys).toEqual([
      'hasActiveLocals',
      'listOk',
      'listWasEmpty',
      'parcela',
      'settlementLookups',
    ]);
    expect(keys.some((key) => /age|days|occurred|lookback/i.test(key))).toBe(false);
  });
});

describe('10-F discovery constants', () => {
  it('S — limite de maintenance é 100', () => {
    expect(MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC).toBe(100);
  });

  it('Y — lookback de discovery é 90 dias (não evidência de tombstone)', () => {
    expect(LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS).toBe(90);
  });
});

describe('readParcelaIdentity', () => {
  it('lê QUITADO e valor_pago', () => {
    expect(
      readParcelaIdentity({
        id: 'e5a3c07c-0fcf-427b-8d4b-1c243e5534d8',
        status: 'QUITADO',
        valor_pago: 37593.68,
      }),
    ).toEqual({
      kind: 'found',
      id: 'e5a3c07c-0fcf-427b-8d4b-1c243e5534d8',
      status: 'QUITADO',
      valorPago: new Prisma.Decimal('37593.68'),
    });
  });

  it('status pago-like inclui QUITADO', () => {
    expect(isCoherentPaidStatus('QUITADO')).toBe(true);
    expect(isCoherentPaidStatus('EM_ABERTO')).toBe(false);
  });
});
