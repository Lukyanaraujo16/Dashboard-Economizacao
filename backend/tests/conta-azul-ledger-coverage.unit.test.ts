import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { isInstallmentLedgerCovered } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-coverage.js';
import { assertLedgerBackfillAllowed } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';

describe('isInstallmentLedgerCovered', () => {
  it('cobre quando Σ gross ACTIVE = paid', () => {
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [{ lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('100') }],
      }),
    ).toBe(true);
  });

  it('não cobre com DELETED, mismatch, vazio ou paid 0', () => {
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('100'),
        rows: [
          { lifecycleStatus: 'ACTIVE', grossAmount: new Prisma.Decimal('100') },
          { lifecycleStatus: 'DELETED', grossAmount: new Prisma.Decimal('10') },
        ],
      }),
    ).toBe(false);
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

describe('assertLedgerBackfillAllowed', () => {
  it('bloqueia production e confirmação ausente', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'LOCAL',
        databaseName: 'dashboard_dev',
      }),
    ).toThrow(/production/);
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: undefined,
        databaseName: 'dashboard_dev',
      }),
    ).toThrow(/--confirm=LOCAL/);
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'LOCAL',
        databaseName: 'dashboard',
      }),
    ).toThrow(/_dev/);
  });

  it('permite development + LOCAL + _dev', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'LOCAL',
        databaseName: 'dashboard_economizacao_dev',
      }),
    ).not.toThrow();
  });
});
