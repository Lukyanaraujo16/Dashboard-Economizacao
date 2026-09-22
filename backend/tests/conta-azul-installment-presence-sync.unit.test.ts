import { describe, expect, it, vi } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
  rankInstallmentPresenceCandidates,
  resolveContaAzulInstallmentPresenceAutoTombstone,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-installment-presence.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';
import {
  buildActiveInstallmentWhere,
  buildMonthlyCompetenceWhere,
} from '../src/modules/finance/repositories/read-query.js';
import {
  classifyPresenceProbeFailure,
  createContaAzulInstallmentPresenceSyncService,
  isConclusiveInstallmentNotFound,
} from '../src/modules/integrations/conta-azul/services/conta-azul-installment-presence-sync.service.js';
import type { ContaAzulInstallmentPresenceRepository } from '../src/modules/integrations/conta-azul/repositories/installment-presence.repository.js';
import { Prisma } from '../src/generated/prisma/client.js';

const scope = {
  tenantId: 'tenant-1',
  integrationId: 'integration-1',
  syncedAt: new Date('2026-09-21T12:00:00.000Z'),
};

function candidate(externalId: string, lastPresenceCheckedAt: Date | null = null) {
  return {
    kind: 'RECEIVABLE' as const,
    externalId,
    lastPresenceCheckedAt,
  };
}

function createPresenceMock(
  overrides: Partial<ContaAzulInstallmentPresenceRepository> = {},
): ContaAzulInstallmentPresenceRepository {
  return {
    listBoundedPresenceProbeCandidates: vi.fn(async () => []),
    countAnalyticalActivePresent: vi.fn(async () => 0),
    markDeleted: vi.fn(async () => ({ changed: true })),
    touchPresenceCheckpoint: vi.fn(async () => undefined),
    ...overrides,
  };
}

function runMaintain(
  presence: ContaAzulInstallmentPresenceRepository,
  getInstallmentDetail: ReturnType<typeof vi.fn>,
  options: { autoTombstone?: boolean } = {},
) {
  const service = createContaAzulInstallmentPresenceSyncService({
    presence,
    apiClient: { getInstallmentDetail } as never,
  });
  return service.maintainPresence({
    scope,
    kind: 'RECEIVABLE',
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
    heartbeat: async () => undefined,
    now: () => new Date('2026-09-21T15:00:00.000Z'),
    ...options,
  });
}

describe('11-E.1 installment presence constants / ranking / flag', () => {
  it('limite bounded = 50 por kind (100/ciclo AR+AP)', () => {
    expect(MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND).toBe(50);
  });

  it('resolveContaAzulInstallmentPresenceAutoTombstone — default seguro false', () => {
    expect(resolveContaAzulInstallmentPresenceAutoTombstone(undefined)).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('')).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('false')).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('FALSE')).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('0')).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('no')).toBe(false);
    // String "false" NÃO é truthy acidental (Boolean("false") === true).
    expect(Boolean('false')).toBe(true);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('false')).toBe(false);
  });

  it('resolveContaAzulInstallmentPresenceAutoTombstone — true explícito', () => {
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('true')).toBe(true);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('TRUE')).toBe(true);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('1')).toBe(true);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('yes')).toBe(true);
  });

  it('flag é função pura em runtime — não depende de recompilação', () => {
    // Mesma função lida valores diferentes sem rebuild (EnvironmentFile + restart).
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('false')).toBe(false);
    expect(resolveContaAzulInstallmentPresenceAutoTombstone('true')).toBe(true);
  });

  it('nunca verificados primeiro; oldest checked depois; desempate externalId', () => {
    const ranked = rankInstallmentPresenceCandidates([
      { externalId: 'c', lastPresenceCheckedAt: new Date('2026-09-20T00:00:00.000Z') },
      { externalId: 'b', lastPresenceCheckedAt: null },
      { externalId: 'a', lastPresenceCheckedAt: null },
      { externalId: 'd', lastPresenceCheckedAt: new Date('2026-09-19T00:00:00.000Z') },
      { externalId: 'e', lastPresenceCheckedAt: new Date('2026-09-19T00:00:00.000Z') },
    ]);
    expect(ranked.map((row) => row.externalId)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });
});

describe('11-E.1 classifyPresenceProbeFailure', () => {
  it('classifica 401/403 como auth', () => {
    expect(
      classifyPresenceProbeFailure(
        new ContaAzulApiError('unauthorized', 'auth', { httpStatus: 401 }),
      ),
    ).toBe('auth');
    expect(
      classifyPresenceProbeFailure(
        new ContaAzulApiError('unavailable', 'forbidden', { httpStatus: 403 }),
      ),
    ).toBe('auth');
  });

  it('classifica timeout / 429 / 5xx / invalid', () => {
    expect(
      classifyPresenceProbeFailure(new ContaAzulApiError('timeout', 't', { httpStatus: 408 })),
    ).toBe('timeout');
    expect(
      classifyPresenceProbeFailure(
        new ContaAzulApiError('rate_limited', 'r', { httpStatus: 429 }),
      ),
    ).toBe('rate_limited');
    expect(
      classifyPresenceProbeFailure(
        new ContaAzulApiError('unavailable', 's', { httpStatus: 503 }),
      ),
    ).toBe('server_error');
    expect(
      classifyPresenceProbeFailure(
        new ContaAzulApiError('invalid_response', 'i', { httpStatus: 200 }),
      ),
    ).toBe('invalid_response');
  });
});

describe('11-E.1 maintainPresence probes', () => {
  it('1) ACTIVE + GET 200 → permanece ACTIVE; avança checkpoint', async () => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('parcela-ok')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
      touchPresenceCheckpoint: touch,
    });
    const getDetail = vi.fn(async () => ({ id: 'parcela-ok', status: 'ATRASADO' }));
    const summary = await runMaintain(presence, getDetail);
    expect(summary.found200).toBe(1);
    expect(summary.tombstoned).toBe(0);
    expect(summary.checkpointsAdvanced).toBe(1);
    expect(markDeleted).not.toHaveBeenCalled();
    expect(touch).toHaveBeenCalledTimes(1);
  });

  it('2/11) ACTIVE + GET 404 → DELETED e avança checkpoint com mutação', async () => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('gone')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
      touchPresenceCheckpoint: touch,
    });
    const getDetail = vi.fn(async () => {
      throw new ContaAzulApiError('unavailable', 'not found', { httpStatus: 404 });
    });
    const summary = await runMaintain(presence, getDetail, { autoTombstone: true });
    expect(summary.notFound404).toBe(1);
    expect(summary.tombstoned).toBe(1);
    expect(summary.checkpointsAdvanced).toBe(1);
    expect(markDeleted).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: scope.tenantId,
        integrationId: scope.integrationId,
        externalId: 'gone',
        kind: 'RECEIVABLE',
      }),
    );
  });

  it('3) 404 idempotente em já DELETED (changed=false)', async () => {
    const markDeleted = vi.fn(async () => ({ changed: false }));
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('already')]),
      countAnalyticalActivePresent: vi.fn(async () => 0),
      markDeleted,
    });
    const getDetail = vi.fn(async () => {
      throw new ContaAzulApiError('unavailable', 'not found', { httpStatus: 404 });
    });
    const summary = await runMaintain(presence, getDetail, { autoTombstone: true });
    expect(summary.tombstoned).toBe(0);
    expect(summary.notFound404).toBe(1);
    expect(summary.checkpointsAdvanced).toBe(1);
  });

  it.each([
    ['4) timeout', new ContaAzulApiError('timeout', 't')],
    ['5) 429', new ContaAzulApiError('rate_limited', 'r', { httpStatus: 429 })],
    ['6) 5xx', new ContaAzulApiError('unavailable', 's', { httpStatus: 502 })],
    ['7a) 401', new ContaAzulApiError('unauthorized', 'a', { httpStatus: 401 })],
    ['7b) 403', new ContaAzulApiError('unavailable', 'f', { httpStatus: 403 })],
    ['8) invalid', new ContaAzulApiError('invalid_response', 'i')],
  ])('%s → não tombstona e não avança checkpoint', async (_label, error) => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('hold')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
      touchPresenceCheckpoint: touch,
    });
    const getDetail = vi.fn(async () => {
      throw error;
    });
    const summary = await runMaintain(presence, getDetail);
    expect(summary.tombstoned).toBe(0);
    expect(summary.probeFailed).toBe(1);
    expect(summary.checkpointsAdvanced).toBe(0);
    expect(markDeleted).not.toHaveBeenCalled();
    expect(touch).not.toHaveBeenCalled();
  });

  it('dry-run: 404 conta wouldTombstone sem mutar nem avançar checkpoint', async () => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('dry')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
      touchPresenceCheckpoint: touch,
    });
    const getDetail = vi.fn(async () => {
      throw new ContaAzulApiError('unavailable', 'not found', { httpStatus: 404 });
    });
    const summary = await runMaintain(presence, getDetail, { autoTombstone: false });
    expect(summary.wouldTombstone).toBe(1);
    expect(summary.tombstoned).toBe(0);
    expect(summary.checkpointsAdvanced).toBe(0);
    expect(markDeleted).not.toHaveBeenCalled();
    expect(touch).not.toHaveBeenCalled();
  });

  it('default autoTombstone omitido → false (dry-run seguro)', async () => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('default')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
    });
    const getDetail = vi.fn(async () => {
      throw new ContaAzulApiError('unavailable', 'not found', { httpStatus: 404 });
    });
    // Sem autoTombstone no input → resolve(undefined) = false
    const summary = await runMaintain(presence, getDetail);
    expect(summary.autoTombstone).toBe(false);
    expect(summary.wouldTombstone).toBe(1);
    expect(summary.tombstoned).toBe(0);
    expect(markDeleted).not.toHaveBeenCalled();
  });

  it('invalid_response + httpStatus 404 NÃO tombstona nem avança checkpoint', async () => {
    const markDeleted = vi.fn(async () => ({ changed: true }));
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('ambiguous')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
      touchPresenceCheckpoint: touch,
    });
    const ambiguous = new ContaAzulApiError('invalid_response', 'malformed', {
      httpStatus: 404,
    });
    expect(isConclusiveInstallmentNotFound(ambiguous)).toBe(false);
    const getDetail = vi.fn(async () => {
      throw ambiguous;
    });
    const summary = await runMaintain(presence, getDetail, { autoTombstone: true });
    expect(summary.tombstoned).toBe(0);
    expect(summary.notFound404).toBe(0);
    expect(summary.probeFailed).toBe(1);
    expect(summary.probeFailures.invalid_response).toBe(1);
    expect(summary.checkpointsAdvanced).toBe(0);
    expect(markDeleted).not.toHaveBeenCalled();
    expect(touch).not.toHaveBeenCalled();
  });

  it('isConclusiveInstallmentNotFound só aceita unavailable+404', () => {
    expect(
      isConclusiveInstallmentNotFound(
        new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      ),
    ).toBe(true);
    expect(
      isConclusiveInstallmentNotFound(
        new ContaAzulApiError('invalid_response', 'bad', { httpStatus: 404 }),
      ),
    ).toBe(false);
    expect(
      isConclusiveInstallmentNotFound(
        new ContaAzulApiError('unavailable', 'server', { httpStatus: 503 }),
      ),
    ).toBe(false);
  });

  it('dry-run: GET 200 ainda avança checkpoint (presença conclusiva)', async () => {
    const touch = vi.fn(async () => undefined);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('ok')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      touchPresenceCheckpoint: touch,
    });
    const summary = await runMaintain(presence, vi.fn(async () => ({ id: 'ok' })), {
      autoTombstone: false,
    });
    expect(summary.found200).toBe(1);
    expect(summary.checkpointsAdvanced).toBe(1);
    expect(touch).toHaveBeenCalledTimes(1);
  });

  it('17) respeita limite bounded do repositório', async () => {
    const list = vi.fn(async () => [candidate('a'), candidate('b')]);
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: list,
      countAnalyticalActivePresent: vi.fn(async () => 99),
    });
    await runMaintain(presence, vi.fn(async () => ({})));
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: scope.tenantId,
        integrationId: scope.integrationId,
        kind: 'RECEIVABLE',
        limit: MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
      }),
    );
  });

  it('33) reexecução 404 é idempotente (segunda chamada changed=false)', async () => {
    const markDeleted = vi
      .fn()
      .mockResolvedValueOnce({ changed: true })
      .mockResolvedValueOnce({ changed: false });
    const presence = createPresenceMock({
      listBoundedPresenceProbeCandidates: vi.fn(async () => [candidate('gone')]),
      countAnalyticalActivePresent: vi.fn(async () => 1),
      markDeleted,
    });
    const getDetail = vi.fn(async () => {
      throw new ContaAzulApiError('unavailable', 'not found', { httpStatus: 404 });
    });
    const first = await runMaintain(presence, getDetail, { autoTombstone: true });
    const second = await runMaintain(presence, getDetail, { autoTombstone: true });
    expect(first.tombstoned).toBe(1);
    expect(second.tombstoned).toBe(0);
  });
});

describe('11-E.1 read models / transfer matcher', () => {
  it('20) buildActiveInstallmentWhere exige lifecycle ACTIVE', () => {
    expect(buildActiveInstallmentWhere({ tenantId: 't1' })).toEqual(
      expect.objectContaining({
        tenantId: 't1',
        lifecycleStatus: 'ACTIVE',
      }),
    );
    expect(buildMonthlyCompetenceWhere({ tenantId: 't1' }, new Date(), new Date())).toEqual(
      expect.objectContaining({ lifecycleStatus: 'ACTIVE' }),
    );
  });

  it('34) transfer matcher 10-A não referencia lifecycle de parcela', () => {
    const day = new Date('2026-09-01T00:00:00.000Z');
    const [decision] = decideTransferMatches(
      [
        {
          id: 'tr-1',
          amount: new Prisma.Decimal('100'),
          occurredOn: day,
          sourceFinancialAccountExternalId: 'src',
          destinationFinancialAccountExternalId: 'dst',
        },
      ],
      [
        {
          id: 'tx-1',
          netAmount: new Prisma.Decimal('100'),
          occurredOn: day,
          financialAccountExternalId: 'src',
          transactionType: 'DISBURSEMENT',
          lifecycleStatus: 'ACTIVE',
        },
      ],
    );
    expect(decision).toEqual({
      transferId: 'tr-1',
      status: 'MATCHED',
      settlementId: 'tx-1',
    });
  });
});
