import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  mapCostCenterPage,
  mapInstallmentCostCenterAllocations,
  reconcileCostCenterAllocationAmounts,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-mappers.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';

describe('Mappers de centros de custo Conta Azul', () => {
  it('mapeia página de catálogo com codigo opcional e ativo', () => {
    const page = mapCostCenterPage({
      itens_totais: 2,
      itens: [
        { id: 'cc-1', nome: 'Jacaraípe', codigo: 'JAC', ativo: true },
        { id: 'cc-2', nome: 'Laranjeiras', ativo: false },
      ],
    });
    expect(page.totalItems).toBe(2);
    expect(page.items).toEqual([
      { externalId: 'cc-1', code: 'JAC', name: 'Jacaraípe', active: true },
      { externalId: 'cc-2', code: null, name: 'Laranjeiras', active: false },
    ]);
  });

  it('retorna lista vazia quando detalhe não tem rateio de centro', () => {
    expect(mapInstallmentCostCenterAllocations({ id: 'p-1' })).toEqual([]);
    expect(mapInstallmentCostCenterAllocations({ id: 'p-1', evento: { rateio: [] } })).toEqual([]);
    expect(
      mapInstallmentCostCenterAllocations({
        id: 'p-1',
        evento: { rateio: [{ id_categoria: 'c1', rateio_centro_custo: [] }] },
      }),
    ).toEqual([]);
  });

  it('mapeia um centro de custo a partir do rateio', () => {
    const items = mapInstallmentCostCenterAllocations({
      id: 'parcela-1',
      evento: {
        rateio: [
          {
            id_categoria: 'cat-1',
            valor: 100,
            rateio_centro_custo: [
              {
                id_centro_custo: 'cc-1',
                nome_centro_custo: 'Jacaraípe',
                valor: '100.00',
              },
            ],
          },
        ],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.externalCostCenterId).toBe('cc-1');
    expect(items[0]?.name).toBe('Jacaraípe');
    expect(items[0]?.amount.equals(new Prisma.Decimal('100.00'))).toBe(true);
  });

  it('agrega N centros e soma o mesmo centro em múltiplos rateios', () => {
    const items = mapInstallmentCostCenterAllocations({
      id: 'parcela-2',
      evento: {
        rateio: [
          {
            rateio_centro_custo: [
              { id_centro_custo: 'cc-1', nome_centro_custo: 'A', valor: 40 },
              { id_centro_custo: 'cc-2', nome_centro_custo: 'B', valor: 30 },
            ],
          },
          {
            rateio_centro_custo: [
              { id_centro_custo: 'cc-1', nome_centro_custo: 'A', valor: 10 },
            ],
          },
        ],
      },
    });
    expect(items).toHaveLength(2);
    const byId = new Map(items.map((item) => [item.externalCostCenterId, item]));
    expect(byId.get('cc-1')?.amount.equals(new Prisma.Decimal(50))).toBe(true);
    expect(byId.get('cc-2')?.amount.equals(new Prisma.Decimal(30))).toBe(true);
  });

  it('ignora itens inválidos sem descartar o detalhe inteiro', () => {
    const items = mapInstallmentCostCenterAllocations({
      id: 'parcela-3',
      evento: {
        rateio: [
          {
            rateio_centro_custo: [
              { id_centro_custo: '', nome_centro_custo: 'X', valor: 10 },
              { id_centro_custo: 'cc-ok', nome_centro_custo: 'Ok', valor: '15.5' },
              { id_centro_custo: 'cc-bad', nome_centro_custo: 'Bad', valor: '1.23456' },
              null,
            ],
          },
        ],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.externalCostCenterId).toBe('cc-ok');
    expect(items[0]?.amount.equals(new Prisma.Decimal('15.5'))).toBe(true);
  });

  it('falha só no root estrutural do detalhe', () => {
    expect(() => mapInstallmentCostCenterAllocations(null)).toThrow(ContaAzulMappingError);
    expect(() => mapInstallmentCostCenterAllocations({ evento: 'x' })).toThrow(
      ContaAzulMappingError,
    );
  });

  it('classifica reconciliação MATCH/PARTIAL/OVER/NO_ALLOCATION', () => {
    const total = new Prisma.Decimal('100');
    expect(
      reconcileCostCenterAllocationAmounts({ total, allocated: new Prisma.Decimal(0) }),
    ).toBe('NO_ALLOCATION');
    expect(
      reconcileCostCenterAllocationAmounts({ total, allocated: new Prisma.Decimal(100) }),
    ).toBe('MATCH');
    expect(
      reconcileCostCenterAllocationAmounts({ total, allocated: new Prisma.Decimal(40) }),
    ).toBe('PARTIAL');
    expect(
      reconcileCostCenterAllocationAmounts({ total, allocated: new Prisma.Decimal(120) }),
    ).toBe('OVER');
  });

  it('reconciliação MATCH dentro do epsilon Decimal', () => {
    const total = new Prisma.Decimal('100.0000');
    expect(
      reconcileCostCenterAllocationAmounts({
        total,
        allocated: new Prisma.Decimal('100.0001'),
      }),
    ).toBe('MATCH');
  });
});
