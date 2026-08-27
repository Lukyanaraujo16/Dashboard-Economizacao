import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  evaluateR3Tombstone,
  isCoherentPaidStatus,
  readParcelaIdentity,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-lifecycle.js';

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
