import { describe, expect, it, vi } from 'vitest';

import { createContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { mapFinancialAccountCurrentBalance } from '../src/modules/integrations/conta-azul/domain/conta-azul-balance-mappers.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import { ContaAzulMoneyError } from '../src/modules/integrations/conta-azul/domain/conta-azul-money.js';
import {
  CONTA_AZUL_FINANCIAL_ACCOUNTS_URL,
  contaAzulFinancialAccountCurrentBalanceUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-oauth.js';
import { Prisma } from '../src/generated/prisma/client.js';

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('Conta Azul saldo-atual (08-C1 client)', () => {
  it('chama path oficial /saldo-atual (não /saldo)', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ saldo_atual: 12.34 }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getFinancialAccountCurrentBalance('token', accountId);
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toBe(contaAzulFinancialAccountCurrentBalanceUrl(accountId));
    expect(url).toContain(`${CONTA_AZUL_FINANCIAL_ACCOUNTS_URL}/${accountId}/saldo-atual`);
    expect(url).not.toContain('/saldo"');
    expect(url.endsWith('/saldo')).toBe(false);
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token');
  });

  it('parseia saldo_atual number', () => {
    expect(mapFinancialAccountCurrentBalance({ saldo_atual: 1500.5 }).balance.toString()).toBe(
      '1500.5',
    );
  });

  it('parseia saldo_atual string decimal', () => {
    expect(mapFinancialAccountCurrentBalance({ saldo_atual: '99.1234' }).balance).toEqual(
      new Prisma.Decimal('99.1234'),
    );
  });

  it('não interpreta ausência como zero', () => {
    expect(() => mapFinancialAccountCurrentBalance({})).toThrow(ContaAzulMappingError);
    expect(() => mapFinancialAccountCurrentBalance({ saldo_atual: null })).toThrow(
      ContaAzulMappingError,
    );
  });

  it('rejeita dinheiro inválido sem virar zero', () => {
    expect(() => mapFinancialAccountCurrentBalance({ saldo_atual: 'abc' })).toThrow(
      ContaAzulMoneyError,
    );
  });

  it('propaga 401/429/5xx como ContaAzulApiError (não zero)', async () => {
    const accountId = '22222222-2222-4222-8222-222222222222';
    const client401 = createContaAzulApiClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ error: 'x' }, 401)),
    });
    await expect(client401.getFinancialAccountCurrentBalance('t', accountId)).rejects.toMatchObject({
      kind: 'unauthorized',
    });

    const client429 = createContaAzulApiClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ error: 'slow' }, 429, { 'Retry-After': '0' }))
        .mockResolvedValueOnce(jsonResponse({ error: 'still' }, 429, { 'Retry-After': '0' })),
      sleep: async () => undefined,
    });
    await expect(client429.getFinancialAccountCurrentBalance('t', accountId)).rejects.toMatchObject({
      kind: 'rate_limited',
    });

    const client500 = createContaAzulApiClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ error: 'err' }, 500))
        .mockResolvedValueOnce(jsonResponse({ error: 'err' }, 500)),
      sleep: async () => undefined,
    });
    await expect(client500.getFinancialAccountCurrentBalance('t', accountId)).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});
