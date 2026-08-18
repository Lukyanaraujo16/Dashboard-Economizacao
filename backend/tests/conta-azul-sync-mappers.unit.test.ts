import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  addCivilYears,
  addUtcDays,
  buildDueDateWindows,
  formatCivilDate,
  parseCivilDate,
  parseOptionalTimestamp,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  mapFinancialAccountPage,
  mapFinancialCategoryPage,
  mapPartyPage,
  mapPayablePage,
  mapReceivablePage,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { mapInstallmentStatus } from '../src/modules/integrations/conta-azul/domain/conta-azul-installment-status.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import { toSanitizedPayloadLog } from '../src/modules/integrations/conta-azul/domain/conta-azul-payload-diagnostic.js';
import {
  ContaAzulMoneyError,
  parseContaAzulMoney,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-money.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

describe('Decimal e datas da sync Conta Azul', () => {
  it('aceita string e number finitos sem arredondar 4 casas', () => {
    expect(parseContaAzulMoney('10.50', 'total').equals(new Prisma.Decimal('10.50'))).toBe(true);
    expect(parseContaAzulMoney(0, 'pago').equals(new Prisma.Decimal('0'))).toBe(true);
  });

  it('rejeita não finito, excesso de casas e tipo inválido', () => {
    expect(() => parseContaAzulMoney(Number.NaN, 'total')).toThrow(ContaAzulMoneyError);
    expect(() => parseContaAzulMoney('1.23456', 'total')).toThrow(ContaAzulMoneyError);
    expect(() => parseContaAzulMoney(null, 'total')).toThrow(ContaAzulMoneyError);
  });

  it('preserva DATE civil sem converter para instante local', () => {
    const date = parseCivilDate('2026-01-15', 'dueDate');
    expect(date.toISOString().startsWith('2026-01-15')).toBe(true);
  });

  it('aceita timestamp ISO', () => {
    const instant = parseOptionalTimestamp('2026-08-15T14:30:00Z', 'data_alteracao');
    expect(instant?.toISOString()).toBe('2026-08-15T14:30:00.000Z');
  });

  it('gera janelas de 90 dias no horizonte configurado', () => {
    const windows = buildDueDateWindows(new Date('2026-08-18T12:00:00Z'), {
      lookbackYears: 1,
      lookaheadYears: 0,
      windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    expect(windows[0]?.from).toBe('2025-08-18');
    expect(windows.at(-1)?.to).toBe('2026-08-18');
    expect(windows.every((window) => window.from <= window.to)).toBe(true);
  });

  it('cobre 5 anos atrás + 2 à frente sem gaps nem overlaps', () => {
    const origin = new Date('2026-08-18T15:30:00-03:00');
    const windows = buildDueDateWindows(origin, {
      lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
      lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
      windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    expect(CONTA_AZUL_SYNC_LOOKBACK_YEARS).toBe(5);
    expect(CONTA_AZUL_SYNC_LOOKAHEAD_YEARS).toBe(2);
    expect(windows[0]?.from).toBe('2021-08-18');
    expect(windows.at(-1)?.to).toBe('2028-08-18');

    for (const [index, window] of windows.entries()) {
      const from = parseCivilDate(window.from, 'from');
      const to = parseCivilDate(window.to, 'to');
      expect(from.getTime()).toBeLessThanOrEqual(to.getTime());
      const inclusiveDays = (to.getTime() - from.getTime()) / 86_400_000 + 1;
      expect(inclusiveDays).toBeLessThanOrEqual(CONTA_AZUL_SYNC_WINDOW_DAYS);
      if (index > 0) {
        const previousTo = parseCivilDate(windows[index - 1]!.to, 'to');
        expect(from.getTime()).toBe(addUtcDays(previousTo, 1).getTime());
      }
    }

    const covered = windows.flatMap((window) => {
      const dates: string[] = [];
      let cursor = parseCivilDate(window.from, 'from');
      const end = parseCivilDate(window.to, 'to');
      while (cursor.getTime() <= end.getTime()) {
        dates.push(formatCivilDate(cursor));
        cursor = addUtcDays(cursor, 1);
      }
      return dates;
    });
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered).toContain('2024-02-29');
    expect(covered).toContain('2023-12-31');
    expect(covered).toContain('2024-01-01');
    expect(covered).toContain('2024-02-01');
  });

  it('usa data civil UTC, não o fuso local', () => {
    const windows = buildDueDateWindows(new Date('2026-08-18T23:30:00-03:00'), {
      lookbackYears: 0,
      lookaheadYears: 0,
      windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    expect(windows).toEqual([{ from: '2026-08-19', to: '2026-08-19' }]);
  });

  it('usa calendário civil com clamp no 29 de fevereiro', () => {
    const origin = parseCivilDate('2024-02-29', 'origin');
    expect(formatCivilDate(addCivilYears(origin, -5))).toBe('2019-02-28');
    expect(formatCivilDate(addCivilYears(origin, 2))).toBe('2026-02-28');
    expect(formatCivilDate(addCivilYears(parseCivilDate('2026-08-18', 'd'), -5))).toBe(
      '2021-08-18',
    );
    expect(formatCivilDate(addCivilYears(parseCivilDate('2025-12-31', 'd'), 1))).toBe('2026-12-31');

    const windows = buildDueDateWindows(new Date('2024-02-29T12:00:00Z'), {
      lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
      lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
      windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    expect(windows[0]?.from).toBe('2019-02-28');
    expect(windows.at(-1)?.to).toBe('2026-02-28');
    for (const [index, window] of windows.entries()) {
      if (index > 0) {
        const previousTo = parseCivilDate(windows[index - 1]!.to, 'to');
        const from = parseCivilDate(window.from, 'from');
        expect(from.getTime()).toBe(addUtcDays(previousTo, 1).getTime());
      }
    }
  });
});

describe('Status de parcela', () => {
  it('mapeia status_traduzido conhecido e preserva o original', () => {
    expect(mapInstallmentStatus('OVERDUE', 'ATRASADO')).toEqual({
      status: 'OVERDUE',
      upstreamStatus: 'ATRASADO',
    });
    expect(mapInstallmentStatus('x', 'PAGO')).toEqual({
      status: 'PAID',
      upstreamStatus: 'PAGO',
    });
  });

  it('valor desconhecido vira UNKNOWN sem quebrar', () => {
    expect(mapInstallmentStatus('WEIRD', 'WEIRD').status).toBe('UNKNOWN');
  });
});

describe('Mappers financeiros', () => {
  it('mapeia categorias com itens/itens_totais', () => {
    const page = mapFinancialCategoryPage({
      itens_totais: 1,
      itens: [
        {
          id: 'cat-1',
          nome: 'Receitas',
          tipo: 'RECEITA',
          categoria_pai: null,
          versao: 2,
        },
      ],
    });
    expect(page.totalItems).toBe(1);
    expect(page.items[0]).toMatchObject({
      externalId: 'cat-1',
      name: 'Receitas',
      type: 'REVENUE',
      parentExternalId: null,
      upstreamVersion: 2,
    });
  });

  it('não persiste agência nem número de conta', () => {
    const page = mapFinancialAccountPage({
      itens: [
        {
          id: 'acc-1',
          nome: 'Conta',
          tipo: 'CONTA_CORRENTE',
          ativo: true,
          agencia: '001',
          numero: '31',
        },
      ],
    });
    expect(JSON.stringify(page.items[0])).not.toContain('001');
    expect(JSON.stringify(page.items[0])).not.toContain('31');
  });

  it('mapeia pessoas com items/totalItems e perfis', () => {
    const page = mapPartyPage({
      totalItems: 1,
      items: [
        {
          id: 'p-1',
          nome: 'Maria',
          documento: '123.456.789-00',
          ativo: true,
          perfis: ['CLIENTE', 'FORNECEDOR', 'OUTRO'],
        },
      ],
    });
    expect(page.totalItems).toBe(1);
    expect(page.items[0]?.profiles).toEqual(['CUSTOMER', 'SUPPLIER']);
  });

  it('trata items null de pessoas como lista vazia', () => {
    const page = mapPartyPage({ items: null, totalItems: 0 });
    expect(page.items).toEqual([]);
    expect(page.totalItems).toBe(0);
  });

  it('rejeita items de pessoas que não são array nem null', () => {
    for (const items of [{}, 'x', 123]) {
      try {
        mapPartyPage({ items, totalItems: 0 });
        throw new Error('mapPartyPage deveria falhar');
      } catch (error) {
        expect(error).toBeInstanceOf(ContaAzulMappingError);
        if (!(error instanceof ContaAzulMappingError)) {
          throw error;
        }
        expect(error.diagnostic).toMatchObject({
          resource: 'pessoas',
          field: 'items',
          expected: 'array',
        });
        expect(error.diagnostic?.received).not.toBe('null');
      }
    }
  });

  it('expõe diagnóstico sanitizado de pessoas sem PII', () => {
    const cases: Array<{
      payload: unknown;
      secret: string;
      diagnostic: Record<string, string | number>;
    }> = [
      {
        payload: { items: [{ id: 123, nome: 'SEGREDO-NAO-DEVE-APARECER' }] },
        secret: 'SEGREDO-NAO-DEVE-APARECER',
        diagnostic: {
          resource: 'pessoas',
          field: 'id',
          expected: 'non-empty-string',
          received: 'number',
          index: 0,
        },
      },
      {
        payload: { items: [{ nome: 'PII' }] },
        secret: 'PII',
        diagnostic: {
          resource: 'pessoas',
          field: 'id',
          expected: 'non-empty-string',
          received: 'undefined',
          index: 0,
        },
      },
      {
        payload: [{ id: 'p-1', nome: 'ARRAY-ROOT' }],
        secret: 'ARRAY-ROOT',
        diagnostic: { resource: 'pessoas', field: 'root', expected: 'object', received: 'array' },
      },
      {
        payload: { items: [{ id: 'p-1', nome: null }] },
        secret: 'p-1',
        diagnostic: {
          resource: 'pessoas',
          field: 'nome',
          expected: 'non-empty-string',
          received: 'null',
          index: 0,
        },
      },
    ];

    for (const fixture of cases) {
      try {
        mapPartyPage(fixture.payload);
        throw new Error('mapPartyPage deveria falhar');
      } catch (error) {
        expect(error).toBeInstanceOf(ContaAzulMappingError);
        if (!(error instanceof ContaAzulMappingError)) {
          throw error;
        }
        expect(error.diagnostic).toMatchObject(fixture.diagnostic);
        const serialized = `${error.message}\n${JSON.stringify(error.diagnostic)}`;
        expect(serialized).not.toContain(fixture.secret);
        expect(serialized).not.toMatch(/123\.456|email|telefone|endereco/i);
      }
    }
  });

  it('monta log sanitizado sem valores de payload', () => {
    const log = toSanitizedPayloadLog({
      syncRunId: 'run-1',
      tenantId: 'tenant-1',
      errorCode: 'sync_invalid_payload',
      diagnostic: {
        resource: 'pessoas',
        field: 'id',
        index: 0,
        expected: 'non-empty-string',
        received: 'number',
        page: 1,
      },
    });
    const serialized = JSON.stringify(log);
    expect(log).toMatchObject({
      msg: 'conta_azul_sync_payload_invalid',
      resource: 'pessoas',
      field: 'id',
      index: 0,
      expected: 'non-empty-string',
      received: 'number',
      page: 1,
      errorCode: 'sync_invalid_payload',
    });
    expect(serialized).not.toContain('SEGREDO');
    expect(serialized).not.toContain('Authorization');
  });

  it('mapeia receber e pagar com money Decimal e categorias', () => {
    const receivable = mapReceivablePage({
      itens_totais: 1,
      itens: [
        {
          id: 'r-1',
          descricao: 'Venda',
          data_vencimento: '2026-08-15',
          data_competencia: '2026-08-01',
          status: 'OVERDUE',
          status_traduzido: 'ATRASADO',
          total: '10.50',
          pago: 0,
          nao_pago: '10.50',
          cliente: { id: 'p-1', nome: 'Maria' },
          categorias: [{ id: 'cat-1', nome: 'Vendas' }],
        },
      ],
    });
    expect(receivable.items[0]?.status).toBe('OVERDUE');
    expect(receivable.items[0]?.externalPartyId).toBe('p-1');
    expect(receivable.items[0]?.categoryExternalIds).toEqual(['cat-1']);
    expect(receivable.items[0]?.total.equals(new Prisma.Decimal('10.50'))).toBe(true);

    const payable = mapPayablePage({
      itens: [
        {
          id: 'ap-1',
          descricao: 'Aluguel',
          data_vencimento: '2026-08-15',
          status: 'PENDENTE',
          status_traduzido: 'EM_ABERTO',
          total: 100,
          pago: 0,
          nao_pago: 100,
          fornecedor: { id: 'p-2', nome: 'Fornecedor' },
        },
      ],
    });
    expect(payable.items[0]?.status).toBe('OPEN');
    expect(payable.items[0]?.externalPartyId).toBe('p-2');
  });
});
