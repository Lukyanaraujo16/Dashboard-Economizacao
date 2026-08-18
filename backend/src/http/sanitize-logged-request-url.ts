const SENSITIVE_QUERY_KEYS = new Set([
  'code',
  'state',
  'access_token',
  'refresh_token',
  'client_secret',
  'id_token',
]);

/** Remove valores de query OAuth/segredos de URLs escritas em log. */
export function sanitizeLoggedRequestUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }

  const path = url.slice(0, queryIndex);
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  let mutated = false;
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, '[REDACTED]');
      mutated = true;
    }
  }

  return mutated ? `${path}?${params.toString()}` : url;
}
