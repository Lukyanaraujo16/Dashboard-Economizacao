import type {
  AnalyticalDimensionKey,
  AnalyticalSemanticFamily,
} from './analytical-keys.js';

/**
 * Dimension Registry: metadata estática.
 * Não implementa resolvers nesta fase.
 * CUSTOMER/SUPPLIER = partyProfile em COUNTERPARTY; CONVENIO ≠ dimensão.
 */
export type AnalyticalIdentityStrategy =
  | 'OFFICIAL_CATEGORY_KEY'
  | 'OFFICIAL_COST_CENTER'
  | 'PARTY_ID_THEN_NORMALIZED_DESCRIPTION';

export type AnalyticalDimensionDefinition = {
  readonly key: AnalyticalDimensionKey;
  readonly identityStrategy: AnalyticalIdentityStrategy;
  readonly compatibleFamilies: readonly AnalyticalSemanticFamily[];
  readonly notes: string;
};

export const ANALYTICAL_DIMENSION_REGISTRY: readonly AnalyticalDimensionDefinition[] = [
  {
    key: 'CATEGORY',
    identityStrategy: 'OFFICIAL_CATEGORY_KEY',
    compatibleFamilies: ['FLOW'],
    notes: 'Categoria financeira oficial; ambiguity possível na resolução de referência.',
  },
  {
    key: 'COST_CENTER',
    identityStrategy: 'OFFICIAL_COST_CENTER',
    compatibleFamilies: ['FLOW'],
    notes: 'Attribution/coverage próprios (FETCHED/EXACT); não fundir algoritmo com COUNTERPARTY.',
  },
  {
    key: 'COUNTERPARTY',
    identityStrategy: 'PARTY_ID_THEN_NORMALIZED_DESCRIPTION',
    compatibleFamilies: ['FLOW'],
    notes:
      'partyId > descrição normalizada. partyProfile CUSTOMER/SUPPLIER é filter, não dimensão.',
  },
] as const;

const BY_KEY = new Map(
  ANALYTICAL_DIMENSION_REGISTRY.map((dimension) => [dimension.key, dimension] as const),
);

export function getAnalyticalDimension(
  key: AnalyticalDimensionKey,
): AnalyticalDimensionDefinition | undefined {
  return BY_KEY.get(key);
}

export function listAnalyticalDimensions(): readonly AnalyticalDimensionDefinition[] {
  return ANALYTICAL_DIMENSION_REGISTRY;
}
