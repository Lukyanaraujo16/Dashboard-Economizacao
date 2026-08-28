import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { isInstallmentLedgerCovered } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-coverage.js';

describe('isInstallmentLedgerCovered', () => {
  it('cobre quando Σ gross ACTIVE = paid', () => {
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [{ lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('100') }],
      }),
    ).toBe(true);
  });

  it('cobre com sibling DELETED se ACTIVE = paid', () => {
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [
          { lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('100') },
          { lifecycleStatus: 'DELETED', grossAmount: new Prisma.Decimal('100') },
        ],
      }),
    ).toBe(true);
  });

  it('não cobre com mismatch, vazio ou paid 0', () => {
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [{ lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('99.99') }],
      }),
    ).toBe(false);
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [],
      }),
    ).toBe(false);
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('0'),
        rows: [{ lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('0') }],
      }),
    ).toBe(false);
  });
});
