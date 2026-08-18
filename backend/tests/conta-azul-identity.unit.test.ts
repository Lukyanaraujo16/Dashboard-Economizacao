import { describe, expect, it, vi } from 'vitest';

import {
  ContaAzulApiError,
  createContaAzulApiClient,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  CONTA_AZUL_CONNECTED_COMPANY_URL,
  CONTA_AZUL_HTTP_TIMEOUT_MS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-oauth.js';
import {
  ContaAzulIdentityMappingError,
  mapContaAzulConnectedCompany,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-identity.js';

const completePayload = {
  id_empresa: '123456',
  documento: '05206246000138',
  razao_social: 'Conta Azul Software Ltda',
  nome_fantasia: 'Conta Azul',
  email: 'api@contaazul.com',
  data_fundacao: '2012-01-01',
};

describe('Mapper da empresa conectada Conta Azul', () => {
  it('mapeia payload oficial completo', () => {
    expect(mapContaAzulConnectedCompany(completePayload)).toEqual({
      externalAccountId: '123456',
      externalCompanyName: 'Conta Azul Software Ltda',
      metadata: {
        documento: '05206246000138',
        nomeFantasia: 'Conta Azul',
        email: 'api@contaazul.com',
      },
    });
  });

  it('usa nome fantasia quando razão social está ausente', () => {
    const mapped = mapContaAzulConnectedCompany({
      id_empresa: '99',
      nome_fantasia: 'Fantasia',
    });
    expect(mapped.externalCompanyName).toBe('Fantasia');
    expect(mapped.metadata).toEqual({ nomeFantasia: 'Fantasia' });
  });

  it('rejeita ausência de id_empresa', () => {
    expect(() => mapContaAzulConnectedCompany({ razao_social: 'X' })).toThrow(
      ContaAzulIdentityMappingError,
    );
    expect(() => mapContaAzulConnectedCompany(null)).toThrow(ContaAzulIdentityMappingError);
  });

  it('aceita documento e email opcionais', () => {
    const mapped = mapContaAzulConnectedCompany({
      id_empresa: '1',
      razao_social: 'Empresa',
    });
    expect(mapped.metadata).toBeNull();
    expect(mapped.externalCompanyName).toBe('Empresa');
  });

  it('não persiste data_fundacao', () => {
    const mapped = mapContaAzulConnectedCompany(completePayload);
    expect(JSON.stringify(mapped)).not.toContain('2012-01-01');
    expect(JSON.stringify(mapped)).not.toContain('data_fundacao');
  });
});

describe('Cliente Bearer da empresa conectada', () => {
  it('envia Authorization Bearer e não relança o token em erro sanitizado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createContaAzulApiClient({ fetchImpl });
    await expect(client.getConnectedCompany('secret-token')).resolves.toMatchObject({
      id_empresa: '123456',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      CONTA_AZUL_CONNECTED_COMPANY_URL,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      }),
    );
  });

  it('401 não faz retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 401 }));
    const client = createContaAzulApiClient({ fetchImpl, retryBackoffMs: 1 });
    await expect(client.getConnectedCompany('t')).rejects.toMatchObject({
      kind: 'unauthorized',
      httpStatus: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('429 faz um retry e depois falha', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"x"}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"error":"x"}', { status: 429 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createContaAzulApiClient({ fetchImpl, retryBackoffMs: 10, sleep });
    await expect(client.getConnectedCompany('t')).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('500 faz um retry e recupera no segundo attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"x"}', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const client = createContaAzulApiClient({
      fetchImpl,
      retryBackoffMs: 1,
      sleep: async () => undefined,
    });
    await expect(client.getConnectedCompany('t')).resolves.toMatchObject({ id_empresa: '123456' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('timeout abortado vira erro timeout sem retry', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const client = createContaAzulApiClient({ fetchImpl, timeoutMs: 20 });
    await expect(client.getConnectedCompany('t')).rejects.toBeInstanceOf(ContaAzulApiError);
    await expect(client.getConnectedCompany('t')).rejects.toMatchObject({ kind: 'timeout' });
    expect(CONTA_AZUL_HTTP_TIMEOUT_MS).toBe(15_000);
  });
});
