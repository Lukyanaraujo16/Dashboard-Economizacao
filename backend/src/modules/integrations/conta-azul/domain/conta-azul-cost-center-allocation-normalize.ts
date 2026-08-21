import { Prisma } from '../../../../generated/prisma/client.js';

/**
 * Epsilon monetário Decimal(19,4): 1 unidade da última casa.
 * Comparações de reconciliação/normalização NÃO usam Float.
 */
export const COST_CENTER_ALLOCATION_MONEY_EPSILON = new Prisma.Decimal('0.0001');

export type CostCenterAllocationNormalizeKind =
  | 'DIRECT'
  | 'EVENT_SCOPED_SINGLE_CENTER'
  | 'PARTIAL'
  | 'MULTI_CENTER_UNRESOLVED'
  | 'NO_ALLOCATION';

export type CostCenterAllocationAmountInput = {
  readonly externalCostCenterId: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
};

export type NormalizedInstallmentCostCenterAllocations = {
  readonly kind: CostCenterAllocationNormalizeKind;
  readonly allocations: readonly CostCenterAllocationAmountInput[];
  readonly upstreamSum: Prisma.Decimal;
};

function sumAmounts(
  allocations: readonly CostCenterAllocationAmountInput[],
): Prisma.Decimal {
  return allocations.reduce(
    (acc, row) => acc.plus(row.amount),
    new Prisma.Decimal(0),
  );
}

function absDiff(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.minus(right).abs();
}

/**
 * Normaliza rateio Conta Azul para o escopo da parcela.
 *
 * Conta Azul pode devolver `rateio_centro_custo.valor` no escopo do EVENTO
 * (repetido em cada GET /parcelas/{id} da série). Persistir o valor cru
 * multiplica artificialmente a allocation.
 *
 * Homologado (CC1.1): EVENT-scoped + exatamente 1 centro → amount = installmentTotal.
 * Multi-centro EVENT-scoped: NÃO normaliza (capacidade futura); preserva upstream
 * e classifica MULTI_CENTER_UNRESOLVED para observabilidade.
 */
export function normalizeInstallmentCostCenterAllocations(input: {
  readonly installmentTotal: Prisma.Decimal;
  readonly allocations: readonly CostCenterAllocationAmountInput[];
}): NormalizedInstallmentCostCenterAllocations {
  const allocations = input.allocations;
  const upstreamSum = sumAmounts(allocations);

  if (allocations.length === 0 || upstreamSum.isZero()) {
    return {
      kind: 'NO_ALLOCATION',
      allocations: [],
      upstreamSum: new Prisma.Decimal(0),
    };
  }

  if (absDiff(upstreamSum, input.installmentTotal).lessThanOrEqualTo(COST_CENTER_ALLOCATION_MONEY_EPSILON)) {
    return {
      kind: 'DIRECT',
      allocations,
      upstreamSum,
    };
  }

  if (upstreamSum.greaterThan(input.installmentTotal.plus(COST_CENTER_ALLOCATION_MONEY_EPSILON))) {
    if (allocations.length === 1) {
      const only = allocations[0]!;
      return {
        kind: 'EVENT_SCOPED_SINGLE_CENTER',
        allocations: [
          {
            externalCostCenterId: only.externalCostCenterId,
            name: only.name,
            amount: input.installmentTotal,
          },
        ],
        upstreamSum,
      };
    }
    return {
      kind: 'MULTI_CENTER_UNRESOLVED',
      allocations,
      upstreamSum,
    };
  }

  return {
    kind: 'PARTIAL',
    allocations,
    upstreamSum,
  };
}
