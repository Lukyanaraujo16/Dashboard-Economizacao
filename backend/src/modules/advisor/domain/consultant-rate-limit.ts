/**
 * Contrato congelado do rate limit do Consultor (F13.6).
 * Redis compartilhado. Sem GET+INCR separado.
 */

export const CONSULTANT_RATE_LIMIT_USER_MAX = 20;
export const CONSULTANT_RATE_LIMIT_TENANT_MAX = 60;
export const CONSULTANT_RATE_LIMIT_WINDOW_SECONDS = 600;

export const CONSULTANT_PLATFORM_LIMIT_MESSAGE =
  'Você atingiu o limite de mensagens do Consultor. Tente novamente em alguns minutos.';

export const CONSULTANT_UNAVAILABLE_MESSAGE = 'O Consultor está temporariamente indisponível.';

export type ConsultantRateLimitPolicy = {
  readonly userMax: number;
  readonly tenantMax: number;
  readonly windowSeconds: number;
};

export const DEFAULT_CONSULTANT_RATE_LIMIT_POLICY: ConsultantRateLimitPolicy = {
  userMax: CONSULTANT_RATE_LIMIT_USER_MAX,
  tenantMax: CONSULTANT_RATE_LIMIT_TENANT_MAX,
  windowSeconds: CONSULTANT_RATE_LIMIT_WINDOW_SECONDS,
};

export type ConsultantRateLimitConsumeInput = {
  readonly tenantId: string;
  readonly userId: string;
};

export type ConsultantRateLimitDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'limit'; readonly scope: 'user' | 'tenant' }
  | { readonly ok: false; readonly kind: 'store_unavailable' };

export type ConsultantRateLimiter = {
  consume(input: ConsultantRateLimitConsumeInput): Promise<ConsultantRateLimitDecision>;
};

export function resolveConsultantRateLimitPolicy(
  overrides: Partial<ConsultantRateLimitPolicy> = {},
): ConsultantRateLimitPolicy {
  return {
    userMax: overrides.userMax ?? DEFAULT_CONSULTANT_RATE_LIMIT_POLICY.userMax,
    tenantMax: overrides.tenantMax ?? DEFAULT_CONSULTANT_RATE_LIMIT_POLICY.tenantMax,
    windowSeconds: overrides.windowSeconds ?? DEFAULT_CONSULTANT_RATE_LIMIT_POLICY.windowSeconds,
  };
}

export function buildConsultantUserRateLimitKey(
  nodeEnv: string,
  tenantId: string,
  userId: string,
): string {
  return `dashboard-economizacao:${nodeEnv}:ratelimit:consultant:${tenantId}:${userId}`;
}

export function buildConsultantTenantRateLimitKey(nodeEnv: string, tenantId: string): string {
  return `dashboard-economizacao:${nodeEnv}:ratelimit:consultant:tenant:${tenantId}`;
}
