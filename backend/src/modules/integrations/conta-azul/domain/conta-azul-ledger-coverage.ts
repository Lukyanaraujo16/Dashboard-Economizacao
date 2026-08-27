import { Prisma } from '../../../../generated/prisma/client.js';

export type LedgerCoverageRow = {
  readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
  readonly grossAmount: Prisma.Decimal;
};

/**
 * Cobertura segura para skip do GET /baixa.
 * Só skip se paid > 0, não houver DELETED, e Σ gross ACTIVE = paid.
 * Mismatch, vazio, DELETED ou pago zero → buscar de novo.
 */
export function isInstallmentLedgerCovered(input: {
  readonly paid: Prisma.Decimal;
  readonly rows: readonly LedgerCoverageRow[];
}): boolean {
  if (input.paid.lte(0)) {
    return false;
  }
  if (input.rows.some((row) => row.lifecycleStatus === 'DELETED')) {
    return false;
  }
  const active = input.rows.filter((row) => row.lifecycleStatus === 'ACTIVE');
  if (active.length === 0) {
    return false;
  }
  const grossActive = active.reduce(
    (acc, row) => acc.add(row.grossAmount),
    new Prisma.Decimal(0),
  );
  return grossActive.equals(input.paid);
}
