/**
 * Deduplica chamadas assíncronas iguais e guarda o resultado por `ttlMs`.
 * Para leituras caras repetidas na mesma navegação (dados só mudam no sync).
 * Rejeição não fica em cache. Mapa limitado a `maxEntries` (descarta os mais antigos).
 */
export function memoizeShortLived<A, R>(
  fn: (arg: A) => Promise<R>,
  options: {
    readonly keyOf: (arg: A, now: number) => string;
    readonly ttlMs: number;
    readonly maxEntries?: number;
    readonly clock?: () => number;
  },
): (arg: A) => Promise<R> {
  const clock = options.clock ?? Date.now;
  const maxEntries = options.maxEntries ?? 500;
  const entries = new Map<string, { readonly expiresAt: number; readonly value: Promise<R> }>();

  return (arg) => {
    const now = clock();
    const key = options.keyOf(arg, now);
    const cached = entries.get(key);
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.value;
    }
    const value = fn(arg);
    entries.delete(key);
    entries.set(key, { expiresAt: now + options.ttlMs, value });
    value.catch(() => {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
    });
    // Inserção ≈ ordem de expiração: descarta do mais antigo até achar um válido dentro do limite.
    for (const [oldKey, entry] of entries) {
      if (entries.size <= maxEntries && entry.expiresAt > now) {
        break;
      }
      entries.delete(oldKey);
    }
    return value;
  };
}
