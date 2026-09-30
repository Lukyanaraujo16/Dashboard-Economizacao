import type { FinancialStockSnapshot } from '../../../analytics/domain/types.js';
import {
  serializeAdvisorCurrentSnapshotFacts,
  type AdvisorCurrentSnapshotFacts,
} from '../advisor-current-snapshot-facts.js';
import { buildFinancialFactsContent } from '../financial-facts-text.js';
import type { AdvisorFinancialFactsSource, AdvisorFinancialSnapshotSource } from '../financial-facts-text.js';
import {
  buildCurrentSnapshotQuery,
  buildFinancialFactsMonthQuery,
} from './build-analytical-query-from-tool.js';
import { validateAnalyticalCapability } from './validate-analytical-capability.js';
import { ANALYTICAL_CIVIL_TIME_ZONE } from './analytical-keys.js';

/**
 * Preload snapshot via capability gate (parity F13.8.5B).
 * Não muda o fact legado — só exige capability publicada.
 */
export function serializeCurrentSnapshotViaUniversal(
  snapshot: FinancialStockSnapshot,
): AdvisorCurrentSnapshotFacts {
  const query = {
    ...buildCurrentSnapshotQuery(),
    period: {
      kind: 'CURRENT' as const,
      asOf: snapshot.today,
      timeZone: ANALYTICAL_CIVIL_TIME_ZONE,
    },
  };
  const validation = validateAnalyticalCapability(query);
  if (!validation.ok) {
    throw new Error(`Snapshot capability negada: ${validation.reason}`);
  }
  return serializeAdvisorCurrentSnapshotFacts(snapshot);
}

/**
 * Preload FINANCIAL_FACTS via capability gate.
 * Conteúdo textual permanece idêntico ao caminho legado.
 */
export function buildFinancialFactsViaUniversal(input: {
  readonly monthKey: string;
  readonly flow: AdvisorFinancialFactsSource | null;
  readonly snapshot: AdvisorFinancialSnapshotSource | null;
}): string {
  const validation = validateAnalyticalCapability(
    buildFinancialFactsMonthQuery({ monthKey: input.monthKey, metric: 'BILLING' }),
  );
  if (!validation.ok) {
    throw new Error(`FINANCIAL_FACTS capability negada: ${validation.reason}`);
  }
  return buildFinancialFactsContent(input);
}
