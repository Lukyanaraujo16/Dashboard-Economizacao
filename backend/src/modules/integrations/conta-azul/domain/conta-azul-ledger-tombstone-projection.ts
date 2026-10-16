import { Prisma } from '../../../../generated/prisma/client.js';
import { classifyInstallmentLedgerCoverage } from './conta-azul-ledger-coverage.js';
import { formatCivilDate } from './conta-azul-dates.js';

/**
 * Correção 10-D — projeção LOCAL de candidatos a tombstone sem Conta Azul.
 * Não confirma R3 (exige lista upstream + GET 404). Apenas detecta
 * over_covered com pares ACTIVE idênticos (padrão de reemissão Life).
 */
export type LocalTombstoneSettlement = {
  readonly id: string;
  readonly externalId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
  readonly occurredOn: Date;
  readonly netAmount: Prisma.Decimal;
  readonly grossAmount: Prisma.Decimal;
  readonly financialAccountExternalId: string | null;
  readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
};

export type LocalTombstoneProjection = {
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly paid: Prisma.Decimal;
  readonly coverage: ReturnType<typeof classifyInstallmentLedgerCoverage>;
  readonly wouldDeleteIds: readonly string[];
  readonly projectedRemovedNet: Prisma.Decimal;
  readonly mode: 'IDENTICAL_PAIR_CANDIDATE' | 'HOLD_NO_IDENTICAL_PAIR' | 'NONE';
};

function fingerprint(row: LocalTombstoneSettlement): string {
  return [
    row.transactionType,
    formatCivilDate(row.occurredOn),
    row.netAmount.toFixed(4),
    row.financialAccountExternalId ?? '',
  ].join('|');
}

export function projectLocalTombstoneCandidates(input: {
  readonly paid: Prisma.Decimal;
  readonly rows: readonly LocalTombstoneSettlement[];
}): LocalTombstoneProjection {
  const active = input.rows.filter((row) => row.lifecycleStatus === 'ACTIVE');
  const sample = active[0];
  const base = {
    installmentExternalId: sample?.installmentExternalId ?? '',
    installmentKind: sample?.installmentKind ?? ('PAYABLE' as const),
    paid: input.paid,
  };
  const coverage = classifyInstallmentLedgerCoverage({
    paid: input.paid,
    rows: active.map((row) => ({
      lifecycleStatus: row.lifecycleStatus,
      grossAmount: row.grossAmount,
    })),
  });
  if (coverage !== 'over_covered' || input.paid.lte(0) || !sample) {
    return {
      ...base,
      coverage,
      wouldDeleteIds: [],
      projectedRemovedNet: new Prisma.Decimal(0),
      mode: 'NONE',
    };
  }

  const groups = new Map<string, LocalTombstoneSettlement[]>();
  for (const row of active) {
    const key = fingerprint(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const wouldDeleteIds: string[] = [];
  let projectedRemovedNet = new Prisma.Decimal(0);
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const sorted = [...group].sort((a, b) => a.externalId.localeCompare(b.externalId));
    for (const extra of sorted.slice(1)) {
      wouldDeleteIds.push(extra.id);
      projectedRemovedNet = projectedRemovedNet.add(extra.netAmount);
    }
  }

  if (wouldDeleteIds.length === 0) {
    return {
      ...base,
      coverage,
      wouldDeleteIds: [],
      projectedRemovedNet: new Prisma.Decimal(0),
      mode: 'HOLD_NO_IDENTICAL_PAIR',
    };
  }

  return {
    ...base,
    coverage,
    wouldDeleteIds,
    projectedRemovedNet,
    mode: 'IDENTICAL_PAIR_CANDIDATE',
  };
}
