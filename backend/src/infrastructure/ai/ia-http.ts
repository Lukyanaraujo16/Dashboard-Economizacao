import { iaProviderError, isAbortError, mapHttpError } from './map-http-error.js';
import { DEFAULT_IA_HTTP_TIMEOUT_MS, IaProviderError, type IaFetch } from './types.js';

export async function postIaJson(options: {
  readonly fetchImpl: IaFetch;
  readonly timeoutMs?: number;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_IA_HTTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let json: unknown = null;
    if (rawText) {
      try {
        json = JSON.parse(rawText) as unknown;
      } catch {
        if (response.ok) {
          throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
        }
        throw mapHttpError(response.status, null);
      }
    }

    if (!response.ok) {
      throw mapHttpError(response.status, json);
    }

    return json;
  } catch (error) {
    if (error instanceof IaProviderError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw iaProviderError('TIMEOUT');
    }
    throw iaProviderError('UNKNOWN');
  } finally {
    clearTimeout(timer);
  }
}
