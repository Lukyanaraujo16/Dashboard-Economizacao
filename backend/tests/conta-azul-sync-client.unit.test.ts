import { describe, expect, it, vi } from 'vitest';

import { createContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  CONTA_AZUL_CATEGORIES_URL,
  CONTA_AZUL_COST_CENTERS_URL,
  CONTA_AZUL_FINANCIAL_ACCOUNTS_URL,
  CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL,
  CONTA_AZUL_PAYABLES_SEARCH_URL,
  CONTA_AZUL_PEOPLE_URL,
  CONTA_AZUL_RECEIVABLES_SEARCH_URL,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-oauth.js';

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('Cliente HTTP financeiro Conta Azul', () => {
  it('pagina categorias com permite_apenas_filhos=false e tamanho 100', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ itens: [], itens_totais: 0 }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getCategories('token', { pagina: 1 });
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url.startsWith(`${CONTA_AZUL_CATEGORIES_URL}?`)).toBe(true);
    expect(url).toContain('pagina=1');
    expect(url).toContain('tamanho_pagina=100');
    expect(url).toContain('permite_apenas_filhos=false');
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token');
  });

  it('lista contas e pessoas com paginação', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({ itens: [], items: [] }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getFinancialAccounts('token', { pagina: 2 });
    await client.getPeople('token', { pagina: 3 });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(CONTA_AZUL_FINANCIAL_ACCOUNTS_URL);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain(CONTA_AZUL_PEOPLE_URL);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('pagina=3');
  });

  it('busca AR/AP com janela de vencimento obrigatória', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({ itens: [] }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.searchReceivables('token', {
      pagina: 1,
      dataVencimentoDe: '2026-01-01',
      dataVencimentoAte: '2026-03-31',
    });
    await client.searchPayables('token', {
      pagina: 1,
      dataVencimentoDe: '2026-01-01',
      dataVencimentoAte: '2026-03-31',
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(CONTA_AZUL_RECEIVABLES_SEARCH_URL);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('data_vencimento_de=2026-01-01');
    expect(String(fetchImpl.mock.calls[1]![0])).toContain(CONTA_AZUL_PAYABLES_SEARCH_URL);
  });

  it('envia data_alteracao opcional em pessoas e AR/AP e omite quando ausente', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({ items: [], itens: [] }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getPeople('token', {
      pagina: 1,
      dataAlteracaoDe: '2026-01-01T00:00:00',
      dataAlteracaoAte: '2026-01-31T23:59:59',
    });
    await client.searchReceivables('token', {
      pagina: 1,
      dataVencimentoDe: '2026-01-01',
      dataVencimentoAte: '2026-03-31',
      dataAlteracaoDe: '2026-02-01T00:00:00',
      dataAlteracaoAte: '2026-02-28T23:59:59',
    });
    const peopleUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(peopleUrl).toContain('data_alteracao_de=2026-01-01T00%3A00%3A00');
    expect(peopleUrl).toContain('data_alteracao_ate=2026-01-31T23%3A59%3A59');
    const arUrl = String(fetchImpl.mock.calls[1]![0]);
    expect(arUrl).toContain('data_vencimento_de=2026-01-01');
    expect(arUrl).toContain('data_alteracao_de=2026-02-01T00%3A00%3A00');
    expect(arUrl).toContain('data_alteracao_ate=2026-02-28T23%3A59%3A59');

    await client.getPeople('token', { pagina: 1 });
    expect(String(fetchImpl.mock.calls[2]![0])).not.toContain('data_alteracao');
  });

  it('401 não faz retry; 429 faz um retry respeitando Retry-After', async () => {
    const unauthorized = vi.fn().mockResolvedValue(jsonResponse({ error: 'x' }, 401));
    const client401 = createContaAzulApiClient({ fetchImpl: unauthorized });
    await expect(client401.getPeople('token', { pagina: 1 })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);

    const limited = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'slow' }, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const client429 = createContaAzulApiClient({
      fetchImpl: limited,
      sleep: async () => undefined,
    });
    await expect(client429.getPeople('token', { pagina: 1 })).resolves.toEqual({ items: [] });
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it('429 sem Retry-After usa o backoff padrão', async () => {
    const slept: number[] = [];
    const limited = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'slow' }, 429))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const client = createContaAzulApiClient({
      fetchImpl: limited,
      retryBackoffMs: 250,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    await expect(client.getPeople('token', { pagina: 1 })).resolves.toEqual({ items: [] });
    expect(slept).toEqual([250]);
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it('500 e timeout fazem um retry', async () => {
    const server = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'x' }, 500))
      .mockResolvedValueOnce(jsonResponse({ itens: [] }));
    const client = createContaAzulApiClient({ fetchImpl: server, sleep: async () => undefined });
    await expect(client.getFinancialAccounts('token', { pagina: 1 })).resolves.toEqual({
      itens: [],
    });
    expect(server).toHaveBeenCalledTimes(2);
  });

  it('lista centros de custo com filtro_rapido=TODOS e tamanho 100', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ itens: [], itens_totais: 0 }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getCostCenters('token', { pagina: 1 });
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url.startsWith(`${CONTA_AZUL_COST_CENTERS_URL}?`)).toBe(true);
    expect(url).toContain('pagina=1');
    expect(url).toContain('tamanho_pagina=100');
    expect(url).toContain('filtro_rapido=TODOS');
  });

  it('GET detalhe da parcela via base parcelas/{id}', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({}));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getInstallmentDetail('token', 'parcela-uuid');
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/parcela-uuid`,
    );
  });

  it('GET baixas via parcelas/{id}/baixa', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse([]));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.getInstallmentSettlements('token', 'parcela-uuid');
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/parcela-uuid/baixa`,
    );
  });

  it('GET baixa por id distingue found e 404 sem lançar', async () => {
    const found = vi.fn().mockResolvedValue(jsonResponse({ id: 'baixa-1', versao: 1 }));
    const clientFound = createContaAzulApiClient({ fetchImpl: found });
    await expect(clientFound.getSettlementById('token', 'baixa-1')).resolves.toEqual({
      kind: 'found',
      payload: { id: 'baixa-1', versao: 1 },
    });
    expect(String(found.mock.calls[0]![0])).toBe(
      `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/baixa/baixa-1`,
    );

    const missing = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const clientMissing = createContaAzulApiClient({ fetchImpl: missing });
    await expect(clientMissing.getSettlementById('token', 'stale-id')).resolves.toEqual({
      kind: 'not_found',
    });
  });

  it('GET baixa por id propaga 5xx como erro operacional', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response('', { status: 500 }));
    const client = createContaAzulApiClient({ fetchImpl, retryBackoffMs: 1, sleep: async () => undefined });
    await expect(client.getSettlementById('token', 'x')).rejects.toMatchObject({
      kind: 'unavailable',
      httpStatus: 500,
    });
  });

  it('envia data_pagamento opcional na busca AR/AP e omite quando ausente', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({ itens: [] }));
    const client = createContaAzulApiClient({ fetchImpl });
    await client.searchReceivables('token', {
      pagina: 1,
      dataVencimentoDe: '2026-01-01',
      dataVencimentoAte: '2026-03-31',
      dataPagamentoDe: '2026-02-01',
      dataPagamentoAte: '2026-02-28',
    });
    const withPayment = String(fetchImpl.mock.calls[0]![0]);
    expect(withPayment).toContain('data_pagamento_de=2026-02-01');
    expect(withPayment).toContain('data_pagamento_ate=2026-02-28');
    await client.searchReceivables('token', {
      pagina: 1,
      dataVencimentoDe: '2026-01-01',
      dataVencimentoAte: '2026-03-31',
    });
    expect(String(fetchImpl.mock.calls[1]![0])).not.toContain('data_pagamento');
  });
});
