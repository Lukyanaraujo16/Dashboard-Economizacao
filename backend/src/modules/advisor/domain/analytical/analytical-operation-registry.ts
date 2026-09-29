import type { AnalyticalOperationKey } from './analytical-keys.js';

/**
 * Operation Registry: vocabulário + regras de cardinalidade.
 * WINNER/TOPN nunca são inferidos pelo tamanho do array.
 */
export type AnalyticalOperationDefinition = {
  readonly key: AnalyticalOperationKey;
  readonly requiresIdentity: boolean;
  readonly usesLimit: boolean;
  /** Quando usesLimit e operation=RANKING_WINNER, limit deve ser 1. */
  readonly winnerRequiresLimitOne: boolean;
  readonly notes: string;
};

export const ANALYTICAL_OPERATION_REGISTRY: readonly AnalyticalOperationDefinition[] = [
  {
    key: 'VALUE',
    requiresIdentity: false,
    usesLimit: false,
    winnerRequiresLimitOne: false,
    notes: 'Scalar oficial.',
  },
  {
    key: 'LOOKUP',
    requiresIdentity: false,
    usesLimit: false,
    winnerRequiresLimitOne: false,
    notes:
      'Agregação de uma entidade. identityRequired ou requiredFilters (ex.: costCenterQuery) vêm da capability.',
  },
  {
    key: 'RANKING_WINNER',
    requiresIdentity: false,
    usesLimit: true,
    winnerRequiresLimitOne: true,
    notes: 'requestedLimit=1; não inferir pelo ranking.length.',
  },
  {
    key: 'RANKING_TOPN',
    requiresIdentity: false,
    usesLimit: true,
    winnerRequiresLimitOne: false,
    notes: 'requestedLimit=N; returnedCount pode ser < N.',
  },
  {
    key: 'BREAKDOWN',
    requiresIdentity: false,
    usesLimit: true,
    winnerRequiresLimitOne: false,
    notes: 'Partes ranqueadas (ex.: categorias).',
  },
  {
    key: 'SHARE',
    requiresIdentity: false,
    usesLimit: false,
    winnerRequiresLimitOne: false,
    notes: 'Vocabulário; share hoje vem embutido em ranking/lookup — sem capability standalone.',
  },
  {
    key: 'MOVEMENTS',
    requiresIdentity: false,
    usesLimit: true,
    winnerRequiresLimitOne: false,
    notes: 'Janela Top N de linhas; não é população completa.',
  },
  {
    key: 'COMPARE',
    requiresIdentity: false,
    usesLimit: false,
    winnerRequiresLimitOne: false,
    notes: 'Exige period.kind=COMPARISON.',
  },
] as const;

const BY_KEY = new Map(
  ANALYTICAL_OPERATION_REGISTRY.map((operation) => [operation.key, operation] as const),
);

export function getAnalyticalOperation(
  key: AnalyticalOperationKey,
): AnalyticalOperationDefinition | undefined {
  return BY_KEY.get(key);
}

export function listAnalyticalOperations(): readonly AnalyticalOperationDefinition[] {
  return ANALYTICAL_OPERATION_REGISTRY;
}
