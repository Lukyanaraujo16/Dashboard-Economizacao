import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { projectLocalTombstoneCandidates } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-tombstone-projection.js';

function row(input: {
  readonly id: string;
  readonly externalId: string;
  readonly net: string;
  readonly occurredOn?: string;
}) {
  return {
    id: input.id,
    externalId: input.externalId,
    installmentExternalId: 'parcela-1',
    installmentKind: 'PAYABLE' as const,
    transactionType: 'DISBURSEMENT' as const,
    occurredOn: new Date(input.occurredOn ?? '2026-08-31T00:00:00.000Z'),
    netAmount: new Prisma.Decimal(input.net),
    grossAmount: new Prisma.Decimal(input.net),
    financialAccountExternalId: 'acc-1',
    lifecycleStatus: 'ACTIVE' as const,
  };
}

describe('projectLocalTombstoneCandidates (10-D dry-run)', () => {
  it('Life-like — par idêntico over_covered projeta 1 wouldDelete', () => {
    const projection = projectLocalTombstoneCandidates({
      paid: new Prisma.Decimal('2550.82'),
      rows: [
        row({ id: '1', externalId: 'aaaa', net: '2550.82' }),
        row({ id: '2', externalId: 'bbbb', net: '2550.82' }),
      ],
    });
    expect(projection.mode).toBe('IDENTICAL_PAIR_CANDIDATE');
    expect(projection.wouldDeleteIds).toEqual(['2']);
    expect(projection.projectedRemovedNet.toFixed(2)).toBe('2550.82');
  });

  it('parciais legítimas cobertas não tombstonam', () => {
    const projection = projectLocalTombstoneCandidates({
      paid: new Prisma.Decimal('1000'),
      rows: [
        row({ id: '1', externalId: 'a', net: '500' }),
        row({ id: '2', externalId: 'b', net: '500' }),
      ],
    });
    expect(projection.mode).toBe('NONE');
    expect(projection.wouldDeleteIds).toEqual([]);
  });

  it('over_covered sem par idêntico → HOLD', () => {
    const projection = projectLocalTombstoneCandidates({
      paid: new Prisma.Decimal('100'),
      rows: [
        row({ id: '1', externalId: 'a', net: '60' }),
        row({ id: '2', externalId: 'b', net: '70', occurredOn: '2026-08-30T00:00:00.000Z' }),
      ],
    });
    expect(projection.mode).toBe('HOLD_NO_IDENTICAL_PAIR');
  });
});
