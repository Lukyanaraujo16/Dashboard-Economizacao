import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  COST_CENTER_ALLOCATION_MONEY_EPSILON,
  normalizeInstallmentCostCenterAllocations,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-allocation-normalize.js';
import {
  mapInstallmentCostCenterAllocations,
  reconcileCostCenterAllocationAmounts,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-mappers.js';

function alloc(
  externalCostCenterId: string,
  name: string,
  amount: string,
) {
  return {
    externalCostCenterId,
    name,
    amount: new Prisma.Decimal(amount),
  };
}

describe('normalizeInstallmentCostCenterAllocations', () => {
  it('NO_ALLOCATION quando lista vazia', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('100'),
      allocations: [],
    });
    expect(result.kind).toBe('NO_ALLOCATION');
    expect(result.allocations).toEqual([]);
  });

  it('DIRECT 1 centro quando Σ ≈ total da parcela', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('315.21'),
      allocations: [alloc('cc-1', 'Jac', '315.21')],
    });
    expect(result.kind).toBe('DIRECT');
    expect(result.allocations[0]?.amount.equals(new Prisma.Decimal('315.21'))).toBe(true);
  });

  it('DIRECT N centros quando Σ ≈ total', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('100'),
      allocations: [
        alloc('cc-1', 'A', '60'),
        alloc('cc-2', 'B', '40'),
      ],
    });
    expect(result.kind).toBe('DIRECT');
    expect(result.allocations).toHaveLength(2);
  });

  it('DIRECT com epsilon Decimal (não Float)', () => {
    const total = new Prisma.Decimal('100.0000');
    const almost = total.minus(COST_CENTER_ALLOCATION_MONEY_EPSILON);
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: total,
      allocations: [alloc('cc-1', 'A', almost.toFixed())],
    });
    expect(result.kind).toBe('DIRECT');
  });

  it('EVENT_SCOPED_SINGLE_CENTER: amount = installmentTotal (não ÷ M)', () => {
    const parcela = new Prisma.Decimal('315.21');
    const eventoRateio = new Prisma.Decimal('11357.52'); // ≈ 36.0316 × parcela
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: parcela,
      allocations: [alloc('cc-1', 'Lar', eventoRateio.toFixed())],
    });
    expect(result.kind).toBe('EVENT_SCOPED_SINGLE_CENTER');
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.amount.equals(parcela)).toBe(true);
    expect(result.allocations[0]?.amount.equals(eventoRateio.div(36))).toBe(false);
  });

  it('EVENT_SCOPED_SINGLE_CENTER para M=56', () => {
    const parcela = new Prisma.Decimal('4944.54');
    const eventoRateio = new Prisma.Decimal('277050.29');
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: parcela,
      allocations: [alloc('cc-1', 'Lar', eventoRateio.toFixed())],
    });
    expect(result.kind).toBe('EVENT_SCOPED_SINGLE_CENTER');
    expect(result.allocations[0]?.amount.equals(parcela)).toBe(true);
  });

  it('PARTIAL preserva upstream sem completar', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('301.05'),
      allocations: [alloc('cc-1', 'A', '294')],
    });
    expect(result.kind).toBe('PARTIAL');
    expect(result.allocations[0]?.amount.equals(new Prisma.Decimal('294'))).toBe(true);
  });

  it('MULTI_CENTER_UNRESOLVED não aplica fórmula proporcional', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('100'),
      allocations: [
        alloc('cc-1', 'A', '800'),
        alloc('cc-2', 'B', '200'),
      ],
    });
    expect(result.kind).toBe('MULTI_CENTER_UNRESOLVED');
    expect(result.allocations[0]?.amount.equals(new Prisma.Decimal('800'))).toBe(true);
    expect(result.allocations[1]?.amount.equals(new Prisma.Decimal('200'))).toBe(true);
  });

  it('parcela única DIRECT permanece intacta', () => {
    const result = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('9.80'),
      allocations: [alloc('cc-1', 'A', '9.80')],
    });
    expect(result.kind).toBe('DIRECT');
  });

  it('mapper + normalizador: EVENT-scoped 1 centro', () => {
    const mapped = mapInstallmentCostCenterAllocations({
      id: 'p-36',
      evento: {
        rateio: [
          {
            rateio_centro_custo: [
              {
                id_centro_custo: 'cc-1',
                nome_centro_custo: 'Laranjeiras',
                valor: '11357.52',
              },
            ],
          },
        ],
      },
    });
    const normalized = normalizeInstallmentCostCenterAllocations({
      installmentTotal: new Prisma.Decimal('315.21'),
      allocations: mapped,
    });
    expect(normalized.kind).toBe('EVENT_SCOPED_SINGLE_CENTER');
    expect(normalized.allocations[0]?.amount.equals(new Prisma.Decimal('315.21'))).toBe(true);
    expect(
      reconcileCostCenterAllocationAmounts({
        total: new Prisma.Decimal('315.21'),
        allocated: normalized.allocations[0]!.amount,
      }),
    ).toBe('MATCH');
  });
});
