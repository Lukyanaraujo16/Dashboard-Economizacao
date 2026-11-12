import { describe, expect, it, vi } from 'vitest';

import { failedCode } from '../src/infrastructure/jobs/conta-azul-manual-sync.worker.js';
import {
  ContaAzulApiError,
  createContaAzulApiClient,
  sanitizeContaAzulEndpoint,
  sanitizeContaAzulUpstreamCode,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { resolveAutoSyncSkipReason } from '../src/modules/integrations/conta-azul/domain/conta-azul-auto-sync-eligibility.js';
import {
  autoSyncRetryDelayMs,
  autoSyncRetryNotBefore,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-auto-sync-schedule.js';
import {
  ContaAzulDateError,
  parseCivilDate,
  splitCivilDateRange,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  buildHistoricalDueHorizon,
  buildHistoricalDueWindows,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-hot-sync.js';
import { CONTA_AZUL_RECEIVABLES_SEARCH_URL } from '../src/modules/integrations/conta-azul/domain/conta-azul-oauth.js';
import {
  CONTA_AZUL_AUTO_SYNC_BACKOFF_MAX_MS,
  CONTA_AZUL_MAX_DUE_RANGE_DAYS,
  isContaAzulSyncErrorCode,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { buildSyncFailureDiagnostic } from '../src/modules/integrations/conta-azul/services/conta-azul-sync-failure-diagnostic.js';
import {
  ContaAzulSyncExecutionError,
  mapUpstreamError,
} from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_RANGE_MESSAGE =
  'O intervalo de data de vencimento excede o limite máximo permitido de 365 dias. Reduza o período e tente novamente.';

function inclusiveDays(from: string, to: string): number {
  return (parseCivilDate(to, 'to').getTime() - parseCivilDate(from, 'from').getTime()) / DAY_MS + 1;
}

function nextDay(value: string): string {
  return new Date(parseCivilDate(value, 'd').getTime() + DAY_MS).toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const QUERY = {
  pagina: 1,
  dataVencimentoDe: '2021-11-12',
  dataVencimentoAte: '2028-11-12',
  dataPagamentoDe: '2026-10-01',
  dataPagamentoAte: '2026-11-30',
};

async function searchError(fetchImpl: ReturnType<typeof vi.fn>): Promise<ContaAzulApiError> {
  const client = createContaAzulApiClient({ fetchImpl, sleep: async () => undefined });
  try {
    await client.searchReceivables('secret-token', QUERY);
  } catch (error) {
    if (error instanceof ContaAzulApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('esperava ContaAzulApiError');
}

describe('splitCivilDateRange — limite de 365 dias por consulta de vencimento', () => {
  it('intervalo menor que o limite fica em uma janela intacta', () => {
    expect(splitCivilDateRange('2026-10-01', '2026-11-30', 365)).toEqual([
      { from: '2026-10-01', to: '2026-11-30' },
    ]);
  });

  it('intervalo de exatamente 365 dias inclusivos fica em uma janela', () => {
    const windows = splitCivilDateRange('2025-01-01', '2025-12-31', 365);
    expect(windows).toEqual([{ from: '2025-01-01', to: '2025-12-31' }]);
    expect(inclusiveDays(windows[0]!.from, windows[0]!.to)).toBe(365);
  });

  it('366 dias (ano bissexto) vira 365 + 1 sem lacuna nem sobreposição', () => {
    expect(splitCivilDateRange('2024-01-01', '2024-12-31', 365)).toEqual([
      { from: '2024-01-01', to: '2024-12-30' },
      { from: '2024-12-31', to: '2024-12-31' },
    ]);
  });

  it('dia único e intervalo invertido', () => {
    expect(splitCivilDateRange('2026-02-28', '2026-02-28', 365)).toEqual([
      { from: '2026-02-28', to: '2026-02-28' },
    ]);
    expect(splitCivilDateRange('2026-03-01', '2026-02-28', 365)).toEqual([]);
  });

  it('rejeita tamanho de janela e datas inválidas', () => {
    expect(() => splitCivilDateRange('2026-01-01', '2026-02-01', 0)).toThrow(ContaAzulDateError);
    expect(() => splitCivilDateRange('2026-02-30', '2026-03-01', 365)).toThrow(ContaAzulDateError);
  });
});

describe('buildHistoricalDueWindows — cobertura integral do horizonte de 7 anos', () => {
  for (const now of [
    new Date('2026-11-12T13:37:00.000Z'),
    new Date('2024-02-29T12:00:00.000Z'),
    new Date('2026-12-31T23:30:00-03:00'),
  ]) {
    it(`janelas contíguas, ≤365 dias e união = envelope (${now.toISOString()})`, () => {
      const horizon = buildHistoricalDueHorizon(now);
      const windows = buildHistoricalDueWindows(now);
      expect(windows.length).toBeGreaterThan(1);
      expect(windows[0]!.from).toBe(horizon.from);
      expect(windows[windows.length - 1]!.to).toBe(horizon.to);
      let covered = 0;
      windows.forEach((window, index) => {
        const days = inclusiveDays(window.from, window.to);
        expect(days).toBeGreaterThanOrEqual(1);
        expect(days).toBeLessThanOrEqual(CONTA_AZUL_MAX_DUE_RANGE_DAYS);
        covered += days;
        const next = windows[index + 1];
        if (next) {
          expect(next.from).toBe(nextDay(window.to));
        }
      });
      expect(covered).toBe(inclusiveDays(horizon.from, horizon.to));
    });
  }

  it('o horizonte não foi reduzido: continua 5 anos para trás e 2 para frente', () => {
    const horizon = buildHistoricalDueHorizon(new Date('2026-11-12T13:37:00.000Z'));
    expect(horizon).toEqual({ from: '2021-11-12', to: '2028-11-12' });
  });
});

describe('Conector — classificação HTTP com metadados seguros', () => {
  it('400 de intervalo: sem retry, status, endpoint sem query e código sanitizado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: DUE_RANGE_MESSAGE }, 400));
    const error = await searchError(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error.kind).toBe('unavailable');
    expect(error.httpStatus).toBe(400);
    expect(error.endpoint).toBe(new URL(CONTA_AZUL_RECEIVABLES_SEARCH_URL).pathname);
    expect(error.upstreamCode).toBe('due_date_range_exceeded');
    expect(error.message).toBe('A Conta Azul recusou a consulta.');
    const serialized = JSON.stringify({ ...error, message: error.message });
    expect(serialized).not.toMatch(/secret-token|Bearer|2021-11-12|data_vencimento|\?/);
  });

  it.each([403, 404, 422])('%i é recusa da origem e não é repetido', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: 'forbidden_scope' }, status));
    const error = await searchError(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error.kind).toBe('unavailable');
    expect(error.httpStatus).toBe(status);
    expect(error.upstreamCode).toBe('forbidden_scope');
  });

  it('429 é repetido uma vez respeitando Retry-After e mantém rate_limited', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({}, 429, { 'Retry-After': '2' }));
    const client = createContaAzulApiClient({ fetchImpl, sleep });
    await expect(client.searchReceivables('t', QUERY)).rejects.toMatchObject({
      kind: 'rate_limited',
      httpStatus: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it.each([500, 502, 503, 504])('%i é indisponibilidade e é repetido uma vez', async (status) => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ error: 'boom' }, status));
    const error = await searchError(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(error.httpStatus).toBe(status);
    expect(error.message).toBe('A Conta Azul está temporariamente indisponível.');
  });

  it('5xx seguido de sucesso devolve o payload', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ itens_totais: 0, itens: [] }));
    const client = createContaAzulApiClient({ fetchImpl, sleep: async () => undefined });
    await expect(client.searchReceivables('t', QUERY)).resolves.toEqual({ itens_totais: 0, itens: [] });
  });

  it('erro de rede fica sem httpStatus, com endpoint', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const error = await searchError(fetchImpl);
    expect(error.kind).toBe('unavailable');
    expect(error.httpStatus).toBeUndefined();
    expect(error.endpoint).toBe(new URL(CONTA_AZUL_RECEIVABLES_SEARCH_URL).pathname);
  });

  it('timeout aborta, é repetido uma vez e vira kind timeout', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(abort);
    const error = await searchError(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(error.kind).toBe('timeout');
  });

  it('endpoint mascara identificadores e descarta query', () => {
    expect(
      sanitizeContaAzulEndpoint(
        'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/11111111-1111-4111-8111-111111111111?x=1',
      ),
    ).toBe('/v1/financeiro/eventos-financeiros/parcelas/:id');
    expect(sanitizeContaAzulEndpoint('https://api-v2.contaazul.com/v1/conta-financeira/123/saldo-atual')).toBe(
      '/v1/conta-financeira/:id/saldo-atual',
    );
    expect(sanitizeContaAzulEndpoint('not a url')).toBe('unknown');
  });

  it('código da origem nunca devolve mensagem livre', () => {
    expect(sanitizeContaAzulUpstreamCode({ error: 'Cliente João da Silva CPF 123 não encontrado' })).toBeUndefined();
    expect(sanitizeContaAzulUpstreamCode({ message: DUE_RANGE_MESSAGE })).toBe('due_date_range_exceeded');
    expect(sanitizeContaAzulUpstreamCode({ codigo: 'VALIDATION_ERROR' })).toBe('VALIDATION_ERROR');
    expect(sanitizeContaAzulUpstreamCode({ error: '123.456.789-00' })).toBeUndefined();
    expect(sanitizeContaAzulUpstreamCode({ code: '11987654321' })).toBeUndefined();
    expect(sanitizeContaAzulUpstreamCode({ code: 'x'.repeat(65) })).toBeUndefined();
    expect(sanitizeContaAzulUpstreamCode(null)).toBeUndefined();
    expect(sanitizeContaAzulUpstreamCode(['a'])).toBeUndefined();
  });
});

describe('Mapeamento para código de sync', () => {
  const api = (kind: ConstructorParameters<typeof ContaAzulApiError>[0], httpStatus?: number) =>
    new ContaAzulApiError(kind, 'x', httpStatus === undefined ? {} : { httpStatus });

  it.each([
    [api('unavailable', 400), 'sync_upstream_rejected'],
    [api('unavailable', 403), 'sync_upstream_rejected'],
    [api('unavailable', 404), 'sync_upstream_rejected'],
    [api('unavailable', 422), 'sync_upstream_rejected'],
    [api('unavailable', 500), 'sync_upstream_unavailable'],
    [api('unavailable', 502), 'sync_upstream_unavailable'],
    [api('unavailable', 503), 'sync_upstream_unavailable'],
    [api('unavailable', 504), 'sync_upstream_unavailable'],
    [api('unavailable'), 'sync_network_error'],
    [api('rate_limited', 429), 'sync_rate_limited'],
    [api('timeout'), 'sync_timeout'],
    [api('unauthorized', 401), 'sync_unauthorized'],
    [api('invalid_response', 200), 'sync_invalid_payload'],
    [new Error('db down'), 'sync_persistence_failed'],
  ] as const)('%o → %s', (error, code) => {
    expect(mapUpstreamError(error).code).toBe(code);
  });

  it('worker: erro fora do engine é interno, não indisponibilidade da origem', () => {
    expect(failedCode(new Error('job stalled more than allowable limit'))).toBe('sync_internal_error');
    expect(failedCode(new ContaAzulSyncExecutionError('sync_upstream_rejected', 'x'))).toBe(
      'sync_upstream_rejected',
    );
  });

  it('novos códigos são públicos e os históricos continuam válidos', () => {
    for (const code of [
      'sync_upstream_rejected',
      'sync_network_error',
      'sync_internal_error',
      'sync_upstream_unavailable',
      'sync_persistence_failed',
    ]) {
      expect(isContaAzulSyncErrorCode(code)).toBe(true);
    }
  });
});

describe('Diagnóstico de falha', () => {
  it('carrega status, endpoint, código e etapa a partir da cadeia de cause, sem segredo', () => {
    const upstream = new ContaAzulApiError('unavailable', 'A Conta Azul recusou a consulta.', {
      httpStatus: 400,
      endpoint: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
      upstreamCode: 'due_date_range_exceeded',
    });
    const mapped = mapUpstreamError(upstream);
    const diagnostic = buildSyncFailureDiagnostic({
      syncRunId: 'run-1',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      trigger: 'SCHEDULED',
      stage: 'hot_receivables_payment',
      errorCode: mapped.code,
      error: new ContaAzulSyncExecutionError(mapped.code, 'wrapper', { cause: upstream }),
    });
    expect(diagnostic).toEqual({
      event: 'conta_azul_sync_failure_diagnostic',
      syncRunId: 'run-1',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      trigger: 'SCHEDULED',
      stage: 'hot_receivables_payment',
      errorCode: 'sync_upstream_rejected',
      failureKind: 'unavailable',
      httpStatus: 400,
      endpoint: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
      upstreamCode: 'due_date_range_exceeded',
    });
  });

  it('erro interno sem ContaAzulApiError fica com metadados HTTP nulos', () => {
    const diagnostic = buildSyncFailureDiagnostic({
      syncRunId: 'run-2',
      tenantId: 't',
      integrationId: 'i',
      trigger: null,
      stage: 'worker',
      errorCode: 'sync_internal_error',
      error: new Error('Bearer abc'),
    });
    expect(diagnostic).toMatchObject({ httpStatus: null, endpoint: null, upstreamCode: null, failureKind: 'Error' });
    expect(JSON.stringify(diagnostic)).not.toContain('Bearer');
  });
});

describe('Backoff do auto-sync', () => {
  const HOUR = 60 * 60 * 1000;
  const MIN = 60 * 1000;

  it('progressão exponencial a partir do intervalo, com teto max(intervalo, 2h)', () => {
    const delays = (intervalMs: number) =>
      [0, 1, 2, 3, 4, 5, 6, 50].map((n) =>
        autoSyncRetryDelayMs({
          consecutiveFailures: n,
          intervalMs,
          maxBackoffMs: CONTA_AZUL_AUTO_SYNC_BACKOFF_MAX_MS,
        }),
      );
    expect(delays(60 * MIN)).toEqual([0, HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR]);
    expect(delays(15 * MIN)).toEqual([0, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR, 2 * HOUR]);
    expect(delays(24 * HOUR)).toEqual([0, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR]);
  });

  it('nunca tenta com mais frequência que o intervalo configurado', () => {
    for (const intervalMs of [5 * MIN, 15 * MIN, 60 * MIN, 24 * HOUR]) {
      for (let n = 1; n < 40; n += 1) {
        expect(
          autoSyncRetryDelayMs({ consecutiveFailures: n, intervalMs, maxBackoffMs: 2 * HOUR }),
        ).toBeGreaterThanOrEqual(intervalMs);
      }
    }
  });

  const base = {
    status: 'CONNECTED' as const,
    tenantStatus: 'ACTIVE' as const,
    hasCredential: true,
    externalAccountId: 'erp-1',
    lastSuccessfulSyncAt: new Date('2026-11-12T13:04:00.000Z'),
    intervalMs: HOUR,
    hasActiveRun: false,
    cursors: [{ externalAccountId: 'erp-1' }],
  };

  it('sem campos de falha (registro antigo) mantém o comportamento original', () => {
    expect(resolveAutoSyncSkipReason({ ...base, now: new Date('2026-11-12T14:05:00.000Z') })).toBeNull();
  });

  it('em sequência de falhas pula com backoff e libera no instante calculado', () => {
    const lastFailureAt = new Date('2026-11-12T15:00:00.000Z');
    const input = { ...base, consecutiveFailures: 3, lastFailureAt };
    expect(resolveAutoSyncSkipReason({ ...input, now: new Date('2026-11-12T15:01:00.000Z') })).toBe('backoff');
    expect(resolveAutoSyncSkipReason({ ...input, now: new Date('2026-11-12T16:59:59.000Z') })).toBe('backoff');
    expect(resolveAutoSyncSkipReason({ ...input, now: new Date('2026-11-12T17:00:00.000Z') })).toBeNull();
    expect(
      autoSyncRetryNotBefore({ consecutiveFailures: 3, lastFailureAt, intervalMs: HOUR, maxBackoffMs: 2 * HOUR }),
    ).toEqual(new Date('2026-11-12T17:00:00.000Z'));
  });

  it('not_due e in_progress continuam prevalecendo sobre backoff', () => {
    const failures = { consecutiveFailures: 5, lastFailureAt: new Date('2026-11-12T13:30:00.000Z') };
    expect(
      resolveAutoSyncSkipReason({ ...base, ...failures, now: new Date('2026-11-12T13:40:00.000Z') }),
    ).toBe('not_due');
    expect(
      resolveAutoSyncSkipReason({
        ...base,
        ...failures,
        hasActiveRun: true,
        now: new Date('2026-11-12T20:00:00.000Z'),
      }),
    ).toBe('in_progress');
  });

  it('zero falhas desde o último sucesso = recuperação imediata', () => {
    expect(
      resolveAutoSyncSkipReason({
        ...base,
        consecutiveFailures: 0,
        lastFailureAt: null,
        now: new Date('2026-11-12T14:05:00.000Z'),
      }),
    ).toBeNull();
  });
});
