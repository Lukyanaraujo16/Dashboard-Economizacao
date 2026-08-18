import {
  CONTA_AZUL_CONNECTED_COMPANY_URL,
  CONTA_AZUL_HTTP_TIMEOUT_MS,
  CONTA_AZUL_IDENTITY_RETRY_BACKOFF_MS,
} from '../domain/conta-azul-oauth.js';

export type ContaAzulApiFailureKind =
  'unauthorized' | 'rate_limited' | 'unavailable' | 'invalid_response' | 'timeout';

export class ContaAzulApiError extends Error {
  readonly kind: ContaAzulApiFailureKind;
  readonly httpStatus?: number;

  constructor(
    kind: ContaAzulApiFailureKind,
    message: string,
    options?: { readonly httpStatus?: number; readonly cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ContaAzulApiError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
  }
}

export type ContaAzulApiClient = {
  getConnectedCompany(accessToken: string): Promise<unknown>;
};

export type ContaAzulApiClientConfig = {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly retryBackoffMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryable(error: ContaAzulApiError): boolean {
  if (error.kind === 'rate_limited') {
    return true;
  }
  return error.kind === 'unavailable' && error.httpStatus !== undefined && error.httpStatus >= 500;
}

async function getConnectedCompanyOnce(
  accessToken: string,
  config: ContaAzulApiClientConfig,
): Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? CONTA_AZUL_HTTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(CONTA_AZUL_CONNECTED_COMPANY_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ContaAzulApiError('timeout', 'A Conta Azul não respondeu a tempo.');
    }
    throw new ContaAzulApiError('unavailable', 'Não foi possível falar com a Conta Azul.', {
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
      throw new ContaAzulApiError(
        'invalid_response',
        'A Conta Azul retornou uma resposta inválida.',
        {
          httpStatus: response.status,
        },
      );
    }
  }

  if (response.status === 401) {
    throw new ContaAzulApiError('unauthorized', 'A autorização da Conta Azul foi recusada.', {
      httpStatus: 401,
    });
  }
  if (response.status === 429) {
    throw new ContaAzulApiError(
      'rate_limited',
      'A Conta Azul limitou temporariamente as solicitações.',
      {
        httpStatus: 429,
      },
    );
  }
  if (!response.ok) {
    throw new ContaAzulApiError('unavailable', 'A Conta Azul está temporariamente indisponível.', {
      httpStatus: response.status,
    });
  }

  return json;
}

export function createContaAzulApiClient(
  config: ContaAzulApiClientConfig = {},
): ContaAzulApiClient {
  const backoffMs = config.retryBackoffMs ?? CONTA_AZUL_IDENTITY_RETRY_BACKOFF_MS;
  const sleep = config.sleep ?? sleepMs;

  return {
    async getConnectedCompany(accessToken) {
      try {
        return await getConnectedCompanyOnce(accessToken, config);
      } catch (error) {
        if (error instanceof ContaAzulApiError && isRetryable(error)) {
          await sleep(backoffMs);
          return getConnectedCompanyOnce(accessToken, config);
        }
        throw error;
      }
    },
  };
}
