import type { AnalyticalFilters } from './analytical-filters.js';
import type { AnalyticalIdentityRef } from './analytical-identity.js';
import type {
  AnalyticalDimensionKey,
  AnalyticalDirection,
  AnalyticalMetricKey,
  AnalyticalOperationKey,
  AnalyticalSemanticFamily,
} from './analytical-keys.js';
import type { AnalyticalPeriod } from './analytical-period.js';

/**
 * Envelope canônico de intenção analítica validada.
 * Comparação vive só em period.kind === 'COMPARISON' (única fonte de verdade).
 * Sem tenant/user/SQL/joins/field selectors/from-to livres.
 */
export type AnalyticalQuery = {
  readonly semanticFamily: AnalyticalSemanticFamily;
  readonly metric: AnalyticalMetricKey;
  readonly direction?: AnalyticalDirection;
  readonly period: AnalyticalPeriod;
  readonly dimension?: AnalyticalDimensionKey;
  readonly operation: AnalyticalOperationKey;
  readonly filters?: AnalyticalFilters;
  readonly identity?: AnalyticalIdentityRef;
  /** requestedLimit; RANKING_WINNER deve ser 1. */
  readonly limit?: number;
};
