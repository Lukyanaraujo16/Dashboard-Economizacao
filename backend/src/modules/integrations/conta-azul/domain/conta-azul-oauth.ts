export const CONTA_AZUL_PROVIDER = 'CONTA_AZUL' as const;

export const CONTA_AZUL_AUTHORIZATION_URL = 'https://login.contaazul.com/#/oauth/authorize';

export const CONTA_AZUL_TOKEN_URL = 'https://api-v2.contaazul.com/oauth/token';

export const CONTA_AZUL_CONNECTED_COMPANY_URL =
  'https://api-v2.contaazul.com/v1/pessoas/conta-conectada';

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
