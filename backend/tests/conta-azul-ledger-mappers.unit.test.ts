import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { formatCivilDate, parseOptionalOffsetTimestamp } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { CONTA_AZUL_LEDGER_AUTO_TOMBSTONE } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  ContaAzulSettlementIdentityError,
  expectedSettlementNet,
  mapSettlement,
  mapSettlementList,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';

function baixa(overrides: Record<string, unknown> = {}) {
  return {
    id: 'baixa-1',
    id_parcela: 'parcela-1',
    data_pagamento: '2025-09-11',
    tipo_evento_financeiro: 'RECEITA',
    versao: 1,
    valor_composicao: {
      valor_bruto: 105432.13,
      valor_liquido: 105432.13,
      juros: 0,
      multa: 0,
      desconto: 0,
      taxa: 0,
    },
    conta_financeira: { id: 'acc-ext-1' },
    metodo_pagamento: 'PIX_PAGAMENTO_INSTANTANEO',
    atualizado_em: '2025-10-15T09:39:08Z',
    ...overrides,
  };
}

describe('Mapper de baixas Conta Azul (CASH-2)', () => {
  it('A — receita simples: bruto = líquido, RECEIPT', () => {
    const mapped = mapSettlement(baixa());
    expect(mapped.transactionType).toBe('RECEIPT');
    expect(mapped.grossAmount.equals(new Prisma.Decimal('105432.13'))).toBe(true);
    expect(mapped.netAmount.equals(new Prisma.Decimal('105432.13'))).toBe(true);
    expect(mapped.interestAmount.equals(0)).toBe(true);
    expect(mapped.fineAmount.equals(0)).toBe(true);
    expect(mapped.discountAmount.equals(0)).toBe(true);
    expect(mapped.feeAmount.equals(0)).toBe(true);
  });

  it('B — despesa simples: DISBURSEMENT', () => {
    const mapped = mapSettlement(
      baixa({
        tipo_evento_financeiro: 'DESPESA',
        valor_composicao: {
          valor_bruto: 212697.71,
          valor_liquido: 212697.71,
          juros: 0,
          multa: 0,
          desconto: 0,
          taxa: 0,
        },
      }),
    );
    expect(mapped.transactionType).toBe('DISBURSEMENT');
    expect(mapped.grossAmount.equals(new Prisma.Decimal('212697.71'))).toBe(true);
    expect(mapped.netAmount.equals(new Prisma.Decimal('212697.71'))).toBe(true);
  });

  it('C — juros + multa: bruto 294, líquido 301.05, sem dupla soma', () => {
    const mapped = mapSettlement(
      baixa({
        tipo_evento_financeiro: 'DESPESA',
        valor_composicao: {
          valor_bruto: '294.00',
          juros: '1.17',
          multa: '5.88',
          desconto: 0,
          taxa: 0,
          valor_liquido: '301.05',
        },
      }),
    );
    expect(mapped.grossAmount.equals(new Prisma.Decimal('294'))).toBe(true);
    expect(mapped.interestAmount.equals(new Prisma.Decimal('1.17'))).toBe(true);
    expect(mapped.fineAmount.equals(new Prisma.Decimal('5.88'))).toBe(true);
    expect(mapped.netAmount.equals(new Prisma.Decimal('301.05'))).toBe(true);
    expect(expectedSettlementNet(mapped).equals(mapped.netAmount)).toBe(true);
  });

  it('D — juros: bruto 650, líquido 664.89', () => {
    const mapped = mapSettlement(
      baixa({
        tipo_evento_financeiro: 'DESPESA',
        valor_composicao: {
          valor_bruto: 650,
          juros: '14.89',
          multa: 0,
          desconto: 0,
          taxa: 0,
          valor_liquido: '664.89',
        },
      }),
    );
    expect(mapped.grossAmount.equals(new Prisma.Decimal('650'))).toBe(true);
    expect(mapped.netAmount.equals(new Prisma.Decimal('664.89'))).toBe(true);
  });

  it('H — data_pagamento 2025-09-11 permanece civil UTC', () => {
    const mapped = mapSettlement(baixa());
    expect(mapped.occurredOn.toISOString()).toBe('2025-09-11T00:00:00.000Z');
    expect(formatCivilDate(mapped.occurredOn)).toBe('2025-09-11');
  });

  it('não inventa timezone para atualizado_em sem offset', () => {
    expect(parseOptionalOffsetTimestamp('2026-04-23T10:21:44', 'atualizado_em')).toBeNull();
    expect(
      mapSettlement(baixa({ atualizado_em: '2026-04-23T10:21:44' })).upstreamUpdatedAt,
    ).toBeNull();
  });

  it('I — tipo inválido não vira receita/despesa', () => {
    expect(() => mapSettlement(baixa({ tipo_evento_financeiro: 'TRANSFERENCIA' }))).toThrow(
      ContaAzulMappingError,
    );
    const listed = mapSettlementList([baixa({ tipo_evento_financeiro: 'TRANSFERENCIA' })]);
    expect(listed.items).toHaveLength(0);
    expect(listed.skippedInvalid).toBe(1);
    expect(listed.skippedIdentityMismatch).toBe(0);
  });

  it('J — valor_liquido ausente não é calculado', () => {
    const listed = mapSettlementList([
      baixa({
        valor_composicao: {
          valor_bruto: 100,
          juros: 0,
          multa: 0,
          desconto: 0,
          taxa: 0,
        },
      }),
    ]);
    expect(listed.items).toHaveLength(0);
    expect(listed.skippedInvalid).toBe(1);
  });

  it('K — identidade divergente não é corrigida', () => {
    expect(() =>
      mapSettlement(
        baixa({
          valor_composicao: {
            valor_bruto: '294.00',
            juros: 0,
            multa: 0,
            desconto: 0,
            taxa: 0,
            valor_liquido: '301.05',
          },
        }),
      ),
    ).toThrow(ContaAzulSettlementIdentityError);
    const listed = mapSettlementList([
      baixa({
        valor_composicao: {
          valor_bruto: '294.00',
          juros: 0,
          multa: 0,
          desconto: 0,
          taxa: 0,
          valor_liquido: '301.05',
        },
      }),
    ]);
    expect(listed.items).toHaveLength(0);
    expect(listed.skippedIdentityMismatch).toBe(1);
    expect(listed.skippedInvalid).toBe(0);
  });

  it('G — array vazio não cria movimentos', () => {
    expect(mapSettlementList([])).toEqual({
      items: [],
      skippedInvalid: 0,
      skippedIdentityMismatch: 0,
    });
  });

  it('lista inválida (não array) falha de forma explícita', () => {
    expect(() => mapSettlementList({ itens: [] })).toThrow(ContaAzulMappingError);
  });

  it('mantém tombstone automático desligado', () => {
    expect(CONTA_AZUL_LEDGER_AUTO_TOMBSTONE).toBe(false);
  });
});
