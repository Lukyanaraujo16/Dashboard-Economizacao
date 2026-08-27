import { Prisma } from '../../../../generated/prisma/client.js';

export type LedgerCoverageRow = {
  readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
  readonly grossAmount: Prisma.Decimal;
};

export type LedgerCoverageClass =
  | 'covered'
  | 'over_covered'
  | 'under_covered'
  | 'unpaid'
  | 'empty';

/**
 * Cobertura para skip do GET /baixa.
 * Σ gross ACTIVE = paid. DELETED não entra na soma e não impede skip.
 */
export function classifyInstallmentLedgerCoverage(input: {
  readonly paid: Prisma.Decimal;
  readonly rows: readonly LedgerCoverageRow[];
}): LedgerCoverageClass {
  if (input.paid.lte(0)) {
    return 'unpaid';
  }
  const active = input.rows.filter((row) => row.lifecycleStatus === 'ACTIVE');
  if (active.length === 0) {
    return 'empty';
  }
  const grossActive = active.reduce(
    (acc, row) => acc.add(row.grossAmount),
    new Prisma.Decimal(0),
  );
  if (grossActive.equals(input.paid)) {
    return 'covered';
  }
  if (grossActive.greaterThan(input.paid)) {
    return 'over_covered';
  }
  return 'under_covered';
}

export function isInstallmentLedgerCovered(input: {
  readonly paid: Prisma.Decimal;
  readonly rows: readonly LedgerCoverageRow[];
}): boolean {
  return classifyInstallmentLedgerCoverage(input) === 'covered';
}
