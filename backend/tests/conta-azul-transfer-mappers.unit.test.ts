import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import { mapFinancialTransfer, mapFinancialTransferList } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-mappers.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';

const SRC = '11111111-1111-4111-8111-111111111111';
const DST = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
/** Conta "Dinheiro" do caso Life (origem da transferência). */
const DINHEIRO = SRC;
/** Conta Bradesco do caso Life (destino). */
const BRADESCO = DST;

function transferJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    data: '2026-08-20',
    valor: 10881,
    descricao: 'Origem: A / Destino: B',
    origem: {
      data: '2026-08-20',
      conta_financeira: { id: SRC, nome: 'Origem' },
    },
    destino: {
      data: '2026-08-20',
      conta_financeira: { id: DST, nome: 'Destino' },
    },
    ...overrides,
  };
}

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('Mapper de transferências Conta Azul (CASH-9C)', () => {
  it('mapeia um objeto origem/destino; descrição não é identidade', () => {
    const mapped = mapFinancialTransfer(transferJson({ descricao: 'qualquer texto' }));
    expect(mapped.externalId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(mapped.amount.equals(dec('10881'))).toBe(true);
    expect(mapped.sourceFinancialAccountExternalId).toBe(SRC);
    expect(mapped.destinationFinancialAccountExternalId).toBe(DST);
    expect(mapped.description).toBe('qualquer texto');
  });

  it('rejeita origem=destino, valor 0 e payload sem contas', () => {
    expect(() =>
      mapFinancialTransfer(transferJson({ destino: { conta_financeira: { id: SRC } } })),
    ).toThrow(ContaAzulMappingError);
    expect(() => mapFinancialTransfer(transferJson({ valor: 0 }))).toThrow(ContaAzulMappingError);
    expect(() => mapFinancialTransfer(transferJson({ origem: {} }))).toThrow(ContaAzulMappingError);
  });

  it('lista inválida incrementa skipped sem inventar row', () => {
    const listed = mapFinancialTransferList({
      itens_totais: 2,
      itens: [transferJson(), { id: 'x' }],
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.skippedInvalid).toBe(1);
    expect(listed.totalItems).toBe(2);
  });
});

describe('Match direcional transferência ↔ settlement (CASH-9C / 10-A)', () => {
  const transfer = {
    id: 't1',
    occurredOn: day('2026-08-20'),
    amount: dec('10881'),
    sourceFinancialAccountExternalId: SRC,
    destinationFinancialAccountExternalId: DST,
  };

  it('zero candidatos = UNMATCHED', () => {
    const [decision] = decideTransferMatches([transfer], []);
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('1 — DISBURSEMENT @ origem único = MATCHED', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's-out',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: SRC,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'DISBURSEMENT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'MATCHED', settlementId: 's-out' });
  });

  it('2 — RECEIPT @ destino único = MATCHED', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's1',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'MATCHED', settlementId: 's1' });
  });

  it('3 — RECEIPT @ origem não é candidato (UNMATCHED)', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's-origin-receipt',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: SRC,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('4 — DISBURSEMENT @ destino não é candidato (UNMATCHED)', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's-dest-out',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'DISBURSEMENT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('5 — Life R$ 1.313: RECEIPT operacional @ Dinheiro (origem) não MATCHED', () => {
    const lifeTransfer = {
      id: 't-life-1313',
      occurredOn: day('2026-08-12'),
      amount: dec('1313'),
      sourceFinancialAccountExternalId: DINHEIRO,
      destinationFinancialAccountExternalId: BRADESCO,
    };
    const [decision] = decideTransferMatches(
      [lifeTransfer],
      [
        {
          id: 'mov-caixa-dinheiro',
          occurredOn: day('2026-08-12'),
          netAmount: dec('1313'),
          financialAccountExternalId: DINHEIRO,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't-life-1313', status: 'UNMATCHED' });
  });

  it('6 — dois candidatos tipados (DISBURSEMENT origem + RECEIPT destino) = AMBIGUOUS', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's1',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
        {
          id: 's2',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: SRC,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'DISBURSEMENT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'AMBIGUOUS' });
  });

  it('7 — mesma data/valor em conta não relacionada = UNMATCHED', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 'sale',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: OTHER,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('8 — valor diferente = UNMATCHED', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 'yield',
          occurredOn: day('2026-08-20'),
          netAmount: dec('0.32'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('9 — data diferente = UNMATCHED', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 's1',
          occurredOn: day('2026-08-21'),
          netAmount: dec('10881'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });

  it('10 — duas transferências disputando o mesmo settlement = AMBIGUOUS nos dois', () => {
    const other = {
      ...transfer,
      id: 't2',
      sourceFinancialAccountExternalId: OTHER,
    };
    const settlement = {
      id: 'shared',
      occurredOn: day('2026-08-20'),
      netAmount: dec('10881'),
      financialAccountExternalId: DST,
      lifecycleStatus: 'ACTIVE' as const,
      transactionType: 'RECEIPT' as const,
    };
    const decisions = decideTransferMatches([transfer, other], [settlement]);
    expect(decisions.every((row) => row.status === 'AMBIGUOUS')).toBe(true);
  });

  it('DELETED não casa mesmo tipado no destino', () => {
    const [decision] = decideTransferMatches(
      [transfer],
      [
        {
          id: 'deleted',
          occurredOn: day('2026-08-20'),
          netAmount: dec('10881'),
          financialAccountExternalId: DST,
          lifecycleStatus: 'DELETED',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decision).toEqual({ transferId: 't1', status: 'UNMATCHED' });
  });
});
