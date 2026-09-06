import { Prisma } from '../../../../generated/prisma/client.js';

export type TransferMatchSource = {
  readonly id: string;
  readonly occurredOn: Date;
  readonly amount: Prisma.Decimal;
  readonly sourceFinancialAccountExternalId: string;
  readonly destinationFinancialAccountExternalId: string;
};

export type SettlementMatchSource = {
  readonly id: string;
  readonly occurredOn: Date;
  readonly netAmount: Prisma.Decimal;
  readonly financialAccountExternalId: string | null;
  readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
  /** Direção da baixa — obrigatória para candidatura tipada (CASH-9C / 10-A). */
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
};

export type TransferMatchDecision =
  | { readonly transferId: string; readonly status: 'UNMATCHED' }
  | { readonly transferId: string; readonly status: 'MATCHED'; readonly settlementId: string }
  | { readonly transferId: string; readonly status: 'AMBIGUOUS' };

function sameCivilDay(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

/**
 * Ghost tipado: saída só na origem; entrada só no destino.
 * RECEIPT @ origem e DISBURSEMENT @ destino nunca são candidatos.
 */
function directionMatchesTransfer(
  settlement: SettlementMatchSource,
  transfer: TransferMatchSource,
): boolean {
  const accountId = settlement.financialAccountExternalId;
  if (!accountId) {
    return false;
  }
  if (
    accountId === transfer.sourceFinancialAccountExternalId &&
    settlement.transactionType === 'DISBURSEMENT'
  ) {
    return true;
  }
  if (
    accountId === transfer.destinationFinancialAccountExternalId &&
    settlement.transactionType === 'RECEIPT'
  ) {
    return true;
  }
  return false;
}

function isActiveCandidate(settlement: SettlementMatchSource, transfer: TransferMatchSource): boolean {
  return (
    settlement.lifecycleStatus === 'ACTIVE' &&
    sameCivilDay(settlement.occurredOn, transfer.occurredOn) &&
    settlement.netAmount.eq(transfer.amount) &&
    directionMatchesTransfer(settlement, transfer)
  );
}

/**
 * Associação 1:1 conservadora e direcional (Correção 10-A).
 * Sem descrição, categoria, cliente ou ID hardcoded.
 * 0 candidatos → UNMATCHED; >1 ou disputa entre transferências → AMBIGUOUS;
 * exatamente um candidato tipado sem disputa → MATCHED.
 */
export function decideTransferMatches(
  transfers: readonly TransferMatchSource[],
  settlements: readonly SettlementMatchSource[],
): readonly TransferMatchDecision[] {
  const candidatesByTransfer = new Map<string, string[]>();
  for (const transfer of transfers) {
    const ids = settlements.filter((row) => isActiveCandidate(row, transfer)).map((row) => row.id);
    candidatesByTransfer.set(transfer.id, ids);
  }

  const claimantsBySettlement = new Map<string, string[]>();
  for (const [transferId, settlementIds] of candidatesByTransfer) {
    for (const settlementId of settlementIds) {
      const current = claimantsBySettlement.get(settlementId) ?? [];
      current.push(transferId);
      claimantsBySettlement.set(settlementId, current);
    }
  }

  return transfers.map((transfer) => {
    const candidates = candidatesByTransfer.get(transfer.id) ?? [];
    if (candidates.length === 0) {
      return { transferId: transfer.id, status: 'UNMATCHED' };
    }
    if (candidates.length !== 1) {
      return { transferId: transfer.id, status: 'AMBIGUOUS' };
    }
    const settlementId = candidates[0]!;
    const claimants = claimantsBySettlement.get(settlementId) ?? [];
    if (claimants.length !== 1) {
      return { transferId: transfer.id, status: 'AMBIGUOUS' };
    }
    return { transferId: transfer.id, status: 'MATCHED', settlementId };
  });
}
