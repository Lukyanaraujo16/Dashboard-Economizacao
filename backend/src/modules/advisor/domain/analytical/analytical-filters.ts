import type { AnalyticalPartyProfile } from './analytical-keys.js';

/**
 * Filters tipados allowlisted. Sem Record<string, unknown>.
 * Sem tenantId/userId/from/to/sql/table/field/url.
 */
export type AnalyticalFilters = {
  readonly partyProfile?: AnalyticalPartyProfile;
  readonly categoryReference?: string;
  readonly costCenterQuery?: string;
};
