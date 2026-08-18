import type { FastifyInstance } from 'fastify';

import { CONTA_AZUL_HTTP_TIMEOUT_MS, CONTA_AZUL_TOKEN_URL } from '../domain/conta-azul-oauth.js';
import type { ContaAzulTokenSet } from '../domain/types.js';
import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';

export type ContaAzulTokenClient = {
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<ContaAzulTokenSet>;
  refresh(refreshToken: string): Promise<ContaAzulTokenSet>;
};

export type ContaAzulTokenClientConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
}

function parseTokenPayload(payload: unknown): ContaAzulTokenSet {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new IntegrationUnavailableError('A Conta Azul retornou uma resposta OAuth inválida.');
  }

  const record = payload as Record<string, unknown>;
  const accessToken = record.access_token;
  const refreshToken = record.refresh_token;
  const expiresIn = record.expires_in;
  const tokenType = record.token_type;

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new IntegrationUnavailableError('A Conta Azul não retornou um access_token válido.');
  }
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new IntegrationUnavailableError('A Conta Azul não retornou um refresh_token válido.');
  }
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new IntegrationUnavailableError('A Conta Azul não retornou expires_in válido.');
  }
  if (typeof tokenType !== 'string' || tokenType.length === 0) {
    throw new IntegrationUnavailableError('A Conta Azul não retornou token_type válido.');
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType,
  };
}

async function postToken(
  config: ContaAzulTokenClientConfig,
  body: URLSearchParams,
): Promise<ContaAzulTokenSet> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? CONTA_AZUL_HTTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(CONTA_AZUL_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthorization(config.clientId, config.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new IntegrationUnavailableError('A Conta Azul não respondeu a tempo.');
    }
    throw new IntegrationUnavailableError('Não foi possível falar com a Conta Azul.', {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  let json: unknown = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      throw new IntegrationUnavailableError('A Conta Azul retornou uma resposta OAuth inválida.');
    }
  }

  if (!response.ok) {
    throw new IntegrationUnavailableError('A autorização com a Conta Azul falhou.');
  }

  return parseTokenPayload(json);
}

export function createContaAzulTokenClient(
  config: ContaAzulTokenClientConfig,
): ContaAzulTokenClient {
  return {
    exchangeAuthorizationCode(code, redirectUri) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });
      return postToken(config, body);
    },

    refresh(refreshToken) {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      return postToken(config, body);
    },
  };
}

export function resolveContaAzulTokenClient(
  app: FastifyInstance,
  config: ContaAzulTokenClientConfig,
): ContaAzulTokenClient {
  const decorated = (app as FastifyInstance & { contaAzulTokenClient?: ContaAzulTokenClient })
    .contaAzulTokenClient;
  return decorated ?? createContaAzulTokenClient(config);
}
