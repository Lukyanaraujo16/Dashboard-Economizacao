export const CONTA_AZUL_PROVIDER = 'CONTA_AZUL' as const;

export const CONTA_AZUL_AUTHORIZATION_URL = 'https://login.contaazul.com/#/oauth/authorize';

export const CONTA_AZUL_TOKEN_URL = 'https://api-v2.contaazul.com/oauth/token';

export const CONTA_AZUL_API_BASE_URL = 'https://api-v2.contaazul.com';

export const CONTA_AZUL_CONNECTED_COMPANY_URL = `${CONTA_AZUL_API_BASE_URL}/v1/pessoas/conta-conectada`;

export const CONTA_AZUL_CATEGORIES_URL = `${CONTA_AZUL_API_BASE_URL}/v1/categorias`;

export const CONTA_AZUL_FINANCIAL_ACCOUNTS_URL = `${CONTA_AZUL_API_BASE_URL}/v1/conta-financeira`;

/** Saldo atual oficial por conta. Path oficial 2026 — NÃO usar `/saldo`. */
export function contaAzulFinancialAccountCurrentBalanceUrl(accountExternalId: string): string {
  return `${CONTA_AZUL_FINANCIAL_ACCOUNTS_URL}/${encodeURIComponent(accountExternalId)}/saldo-atual`;
}

export const CONTA_AZUL_PEOPLE_URL = `${CONTA_AZUL_API_BASE_URL}/v1/pessoas`;

export const CONTA_AZUL_RECEIVABLES_SEARCH_URL = `${CONTA_AZUL_API_BASE_URL}/v1/financeiro/eventos-financeiros/contas-a-receber/buscar`;

export const CONTA_AZUL_PAYABLES_SEARCH_URL = `${CONTA_AZUL_API_BASE_URL}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar`;


export const CONTA_AZUL_INSTALLMENT_SETTLEMENTS_URL = `${CONTA_AZUL_API_BASE_URL}/v1/financeiro/eventos-financeiros/parcelas`;

export const CONTA_AZUL_COST_CENTERS_URL = `${CONTA_AZUL_API_BASE_URL}/v1/centro-de-custo`;

export const CONTA_AZUL_TRANSFERS_URL = `${CONTA_AZUL_API_BASE_URL}/v1/financeiro/transferencias`;

export const CONTA_AZUL_IDENTITY_RETRY_BACKOFF_MS = 250;

export const CONTA_AZUL_SCOPE = 'openid profile aws.cognito.signin.user.admin';

/** Authorization code da Conta Azul: 3 minutos. State cobre o tempo de login no IdP. */
export const CONTA_AZUL_OAUTH_STATE_TTL_SECONDS = 600;

/** Renova o access token alguns minutos antes do expires_at oficial. */
export const CONTA_AZUL_ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export const CONTA_AZUL_HTTP_TIMEOUT_MS = 15_000;

export type ContaAzulCallbackSignal =
  'connected' | 'denied' | 'invalid' | 'expired' | 'error' | 'replay';

export function buildContaAzulAuthorizationUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: CONTA_AZUL_SCOPE,
  });
  return `${CONTA_AZUL_AUTHORIZATION_URL}?${params.toString()}`;
}

export function isAccessTokenFresh(accessExpiresAt: Date, now: Date, skewMs: number): boolean {
  return accessExpiresAt.getTime() - skewMs > now.getTime();
}
