import {
  CONTA_AZUL_CATEGORIES_URL,
  CONTA_AZUL_CONNECTED_COMPANY_URL,
  CONTA_AZUL_COST_CENTERS_URL,
  CONTA_AZUL_FINANCIAL_ACCOUNTS_URL,
  CONTA_AZUL_HTTP_TIMEOUT_MS,
  CONTA_AZUL_IDENTITY_RETRY_BACKOFF_MS,
  CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL,
  CONTA_AZUL_PAYABLES_SEARCH_URL,
  CONTA_AZUL_PEOPLE_URL,
  CONTA_AZUL_RECEIVABLES_SEARCH_URL,
  CONTA_AZUL_TRANSFERS_URL,
  contaAzulFinancialAccountCurrentBalanceUrl,
} from '../domain/conta-azul-oauth.js';
import {
  CONTA_AZUL_CATEGORIES_ONLY_CHILDREN,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../domain/conta-azul-sync.js';

export type ContaAzulApiFailureKind =
  'unauthorized' | 'rate_limited' | 'unavailable' | 'invalid_response' | 'timeout';

export class ContaAzulApiError extends Error {
  readonly kind: ContaAzulApiFailureKind;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  /** Path chamado, sem query string e com identificadores mascarados. */
  readonly endpoint?: string;
  /** Código de erro da origem já sanitizado (token curto ou motivo conhecido). */
  readonly upstreamCode?: string;

  constructor(
    kind: ContaAzulApiFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly retryAfterMs?: number;
      readonly cause?: unknown;
      readonly endpoint?: string;
      readonly upstreamCode?: string;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ContaAzulApiError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.retryAfterMs = options?.retryAfterMs;
    this.endpoint = options?.endpoint;
    this.upstreamCode = options?.upstreamCode;
  }
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,})$/i;

/** Path sem query string (filtros e datas) e sem identificadores de registro. */
export function sanitizeContaAzulEndpoint(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 'unknown';
  }
  return pathname
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
}

// Começa por letra/underscore: descarta documento, telefone ou valor só numérico.
const UPSTREAM_CODE_TOKEN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
const KNOWN_UPSTREAM_REASONS: ReadonlyArray<{ readonly pattern: RegExp; readonly code: string }> = [
  { pattern: /intervalo de data de vencimento excede/i, code: 'due_date_range_exceeded' },
];

/**
 * Extrai um código de erro seguro do corpo de erro da origem.
 * Só devolve tokens curtos sem espaço ou um motivo conhecido mapeado;
 * nunca a mensagem livre (pode conter nome, documento ou valor).
 */
export function sanitizeContaAzulUpstreamCode(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  for (const key of ['code', 'codigo', 'error_code', 'errorCode', 'error']) {
    const value = record[key];
    if (typeof value === 'string' && UPSTREAM_CODE_TOKEN.test(value)) {
      return value;
    }
  }
  for (const key of ['error', 'message', 'mensagem']) {
    const value = record[key];
    if (typeof value !== 'string') {
      continue;
    }
    const known = KNOWN_UPSTREAM_REASONS.find((reason) => reason.pattern.test(value));
    if (known) {
      return known.code;
    }
  }
  return undefined;
}

export type ContaAzulPageQuery = {
  readonly pagina: number;
  readonly tamanhoPagina?: number;
};

export type ContaAzulPeopleQuery = ContaAzulPageQuery & {
  readonly dataAlteracaoDe?: string;
  readonly dataAlteracaoAte?: string;
};

export type ContaAzulInstallmentSearchQuery = ContaAzulPageQuery & {
  readonly dataVencimentoDe: string;
  readonly dataVencimentoAte: string;
  readonly dataAlteracaoDe?: string;
  readonly dataAlteracaoAte?: string;
  readonly dataPagamentoDe?: string;
  readonly dataPagamentoAte?: string;
};

export type ContaAzulCostCentersQuery = ContaAzulPageQuery & {
  readonly filtroRapido?: 'TODOS' | 'ATIVO' | 'INATIVO';
};

export type ContaAzulTransfersQuery = ContaAzulPageQuery & {
  readonly dataInicio?: string;
  readonly dataFim?: string;
  readonly idsContaFinanceira?: readonly string[];
};

export type ContaAzulSettlementLookup =
  | { readonly kind: 'found'; readonly payload: unknown }
  | { readonly kind: 'not_found' };

export type ContaAzulApiClient = {
  getConnectedCompany(accessToken: string): Promise<unknown>;
  getCategories(accessToken: string, query: ContaAzulPageQuery): Promise<unknown>;
  getFinancialAccounts(accessToken: string, query: ContaAzulPageQuery): Promise<unknown>;
  /** GET /v1/conta-financeira/{id}/saldo-atual — payload cru; parse via mapper. */
  getFinancialAccountCurrentBalance(
    accessToken: string,
    accountExternalId: string,
  ): Promise<unknown>;
  getPeople(accessToken: string, query: ContaAzulPeopleQuery): Promise<unknown>;
  getCostCenters(accessToken: string, query: ContaAzulCostCentersQuery): Promise<unknown>;
  searchReceivables(accessToken: string, query: ContaAzulInstallmentSearchQuery): Promise<unknown>;
  searchPayables(accessToken: string, query: ContaAzulInstallmentSearchQuery): Promise<unknown>;
  getInstallmentDetail(accessToken: string, installmentExternalId: string): Promise<unknown>;
  getInstallmentSettlements(accessToken: string, installmentExternalId: string): Promise<unknown>;
  getSettlementById(accessToken: string, settlementExternalId: string): Promise<ContaAzulSettlementLookup>;
  searchTransfers(accessToken: string, query: ContaAzulTransfersQuery): Promise<unknown>;
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

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), 60_000);
  }
  return undefined;
}

function isRetryable(error: ContaAzulApiError): boolean {
  if (error.kind === 'rate_limited' || error.kind === 'timeout') {
    return true;
  }
  return error.kind === 'unavailable' && error.httpStatus !== undefined && error.httpStatus >= 500;
}

async function getJsonOnce(
  url: string,
  accessToken: string,
  config: ContaAzulApiClientConfig,
  options?: { readonly notFoundAsLookup?: boolean },
): Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? CONTA_AZUL_HTTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = sanitizeContaAzulEndpoint(url);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ContaAzulApiError('timeout', 'A Conta Azul não respondeu a tempo.', { endpoint });
    }
    throw new ContaAzulApiError('unavailable', 'Não foi possível falar com a Conta Azul.', {
      cause: error,
      endpoint,
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
        { httpStatus: response.status, endpoint },
      );
    }
  }

  if (response.status === 401) {
    throw new ContaAzulApiError('unauthorized', 'A autorização da Conta Azul foi recusada.', {
      httpStatus: 401,
      endpoint,
    });
  }
  if (response.status === 429) {
    throw new ContaAzulApiError(
      'rate_limited',
      'A Conta Azul limitou temporariamente as solicitações.',
      {
        httpStatus: 429,
        retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
        endpoint,
      },
    );
  }
  if (response.status === 404 && options?.notFoundAsLookup === true) {
    return { kind: 'not_found' } satisfies ContaAzulSettlementLookup;
  }
  if (!response.ok) {
    const rejected = response.status < 500;
    throw new ContaAzulApiError(
      'unavailable',
      rejected
        ? 'A Conta Azul recusou a consulta.'
        : 'A Conta Azul está temporariamente indisponível.',
      {
        httpStatus: response.status,
        endpoint,
        upstreamCode: sanitizeContaAzulUpstreamCode(json),
      },
    );
  }

  if (options?.notFoundAsLookup === true) {
    return { kind: 'found', payload: json } satisfies ContaAzulSettlementLookup;
  }
  return json;
}

function withQuery(
  url: string,
  params: Record<string, string | number | boolean | readonly string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }
      continue;
    }
    search.set(key, String(value));
  }
  return `${url}?${search.toString()}`;
}

export function createContaAzulApiClient(
  config: ContaAzulApiClientConfig = {},
): ContaAzulApiClient {
  const backoffMs = config.retryBackoffMs ?? CONTA_AZUL_IDENTITY_RETRY_BACKOFF_MS;
  const sleep = config.sleep ?? sleepMs;

  async function getJson(url: string, accessToken: string): Promise<unknown> {
    try {
      return await getJsonOnce(url, accessToken, config);
    } catch (error) {
      if (error instanceof ContaAzulApiError && isRetryable(error)) {
        await sleep(error.retryAfterMs ?? backoffMs);
        return getJsonOnce(url, accessToken, config);
      }
      throw error;
    }
  }

  async function getSettlementLookup(
    url: string,
    accessToken: string,
  ): Promise<ContaAzulSettlementLookup> {
    try {
      return (await getJsonOnce(url, accessToken, config, { notFoundAsLookup: true })) as ContaAzulSettlementLookup;
    } catch (error) {
      if (error instanceof ContaAzulApiError && isRetryable(error)) {
        await sleep(error.retryAfterMs ?? backoffMs);
        return (await getJsonOnce(url, accessToken, config, {
          notFoundAsLookup: true,
        })) as ContaAzulSettlementLookup;
      }
      throw error;
    }
  }

  return {
    getConnectedCompany(accessToken) {
      return getJson(CONTA_AZUL_CONNECTED_COMPANY_URL, accessToken);
    },

    getCategories(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_CATEGORIES_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          permite_apenas_filhos: CONTA_AZUL_CATEGORIES_ONLY_CHILDREN,
        }),
        accessToken,
      );
    },

    getFinancialAccounts(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_FINANCIAL_ACCOUNTS_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
        }),
        accessToken,
      );
    },

    getFinancialAccountCurrentBalance(accessToken, accountExternalId) {
      return getJson(
        contaAzulFinancialAccountCurrentBalanceUrl(accountExternalId),
        accessToken,
      );
    },

    getPeople(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_PEOPLE_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          data_alteracao_de: query.dataAlteracaoDe,
          data_alteracao_ate: query.dataAlteracaoAte,
        }),
        accessToken,
      );
    },

    getCostCenters(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_COST_CENTERS_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          filtro_rapido: query.filtroRapido ?? 'TODOS',
        }),
        accessToken,
      );
    },

    searchReceivables(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_RECEIVABLES_SEARCH_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          data_vencimento_de: query.dataVencimentoDe,
          data_vencimento_ate: query.dataVencimentoAte,
          data_alteracao_de: query.dataAlteracaoDe,
          data_alteracao_ate: query.dataAlteracaoAte,
          data_pagamento_de: query.dataPagamentoDe,
          data_pagamento_ate: query.dataPagamentoAte,
        }),
        accessToken,
      );
    },

    searchPayables(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_PAYABLES_SEARCH_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          data_vencimento_de: query.dataVencimentoDe,
          data_vencimento_ate: query.dataVencimentoAte,
          data_alteracao_de: query.dataAlteracaoDe,
          data_alteracao_ate: query.dataAlteracaoAte,
          data_pagamento_de: query.dataPagamentoDe,
          data_pagamento_ate: query.dataPagamentoAte,
        }),
        accessToken,
      );
    },

    getInstallmentDetail(accessToken, installmentExternalId) {
      return getJson(
        `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/${encodeURIComponent(installmentExternalId)}`,
        accessToken,
      );
    },

    getInstallmentSettlements(accessToken, installmentExternalId) {
      return getJson(
        `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/${encodeURIComponent(installmentExternalId)}/baixa`,
        accessToken,
      );
    },

    getSettlementById(accessToken, settlementExternalId) {
      return getSettlementLookup(
        `${CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL}/baixa/${encodeURIComponent(settlementExternalId)}`,
        accessToken,
      );
    },

    searchTransfers(accessToken, query) {
      return getJson(
        withQuery(CONTA_AZUL_TRANSFERS_URL, {
          pagina: query.pagina,
          tamanho_pagina: query.tamanhoPagina ?? CONTA_AZUL_SYNC_PAGE_SIZE,
          data_inicio: query.dataInicio,
          data_fim: query.dataFim,
          ids_conta_financeira: query.idsContaFinanceira,
        }),
        accessToken,
      );
    },
  };
}
