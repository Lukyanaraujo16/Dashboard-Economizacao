import { EMPTY_SYNC_COUNTS } from '../../integrations/conta-azul/domain/conta-azul-sync.js';

const COUNT_KEYS = new Set<string>(Object.keys(EMPTY_SYNC_COUNTS));

/**
 * Só contagens numéricas já persistidas. Descarta qualquer outro campo do JSON.
 */
export function sanitizeSyncCounts(value: unknown): Record<string, number> | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!COUNT_KEYS.has(key)) {
      continue;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      continue;
    }
    result[key] = raw;
  }
  if (Object.keys(result).length === 0) {
    return null;
  }
  return result;
}
