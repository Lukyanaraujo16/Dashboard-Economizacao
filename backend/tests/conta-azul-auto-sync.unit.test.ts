import { describe, expect, it } from 'vitest';

import {
  autoSyncSpreadDelayMs,
  isAutoSyncDue,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-auto-sync-schedule.js';
import { resolveAutoSyncSkipReason } from '../src/modules/integrations/conta-azul/domain/conta-azul-auto-sync-eligibility.js';
import {
  buildIncrementalWindow,
  CONTA_AZUL_SYNC_CURSOR_OVERLAP_MS,
  splitAlterationChunks,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-incremental.js';
import {
  CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_DEFAULT,
  parseAutoSyncIntervalMinutes,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { cursorsHaveIdentityMismatch } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync-identity.js';
import { formatSaoPauloDateTime } from '../src/modules/integrations/conta-azul/domain/conta-azul-timezone.js';

const INTEGRATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function eligibleBase() {
  return {
    status: 'CONNECTED' as const,
    tenantStatus: 'ACTIVE' as const,
    hasCredential: true,
    externalAccountId: 'erp-1',
    lastSuccessfulSyncAt: new Date('2026-08-18T12:00:00.000Z'),
    now: new Date('2026-08-18T13:01:00.000Z'),
    intervalMs: 60 * 60 * 1000,
    hasActiveRun: false,
    cursors: [] as { readonly externalAccountId: string }[],
  };
}

describe('Janela incremental e timezone São Paulo', () => {
  it('aplica overlap de 2h sobre o watermark', () => {
    const window = buildIncrementalWindow({
      cursorAt: new Date('2026-08-18T12:00:00.000Z'),
      baselineAt: new Date('2026-08-18T10:00:00.000Z'),
      executionStartedAt: new Date('2026-08-18T13:00:00.000Z'),
    });
    expect(window.from.toISOString()).toBe('2026-08-18T10:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-08-18T13:00:00.000Z');
    expect(CONTA_AZUL_SYNC_CURSOR_OVERLAP_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('bootstrap sem cursor usa lastSuccessfulSyncAt da baseline', () => {
    const window = buildIncrementalWindow({
      cursorAt: null,
      baselineAt: new Date('2026-08-18T12:00:00.000Z'),
      executionStartedAt: new Date('2026-08-18T13:00:00.000Z'),
    });
    expect(window.from.toISOString()).toBe('2026-08-18T10:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-08-18T13:00:00.000Z');
  });

  it('fatiar alteração em chunks de no máximo 365 dias', () => {
    const from = new Date('2024-01-01T00:00:00.000Z');
    const to = new Date('2025-08-01T00:00:00.000Z');
    const chunks = splitAlterationChunks({ from, to });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.to.getTime() - chunk.from.getTime()).toBeLessThanOrEqual(
        365 * 24 * 60 * 60 * 1000,
      );
    }
    expect(chunks[0]?.from.toISOString()).toBe(from.toISOString());
    expect(chunks.at(-1)?.to.toISOString()).toBe(to.toISOString());
  });

  it('formata America/Sao_Paulo sem depender do TZ do processo, inclusive DST histórico', () => {
    expect(formatSaoPauloDateTime(new Date('2017-02-15T15:00:00.000Z'))).toBe(
      '2017-02-15T13:00:00',
    );
    expect(formatSaoPauloDateTime(new Date('2017-06-15T15:00:00.000Z'))).toBe(
      '2017-06-15T12:00:00',
    );
    expect(formatSaoPauloDateTime(new Date('2026-08-18T15:00:00.000Z'))).toBe(
      '2026-08-18T12:00:00',
    );
  });
});

describe('Frequência, jitter e elegibilidade', () => {
  it('default 60 minutos e env inválido falha', () => {
    expect(parseAutoSyncIntervalMinutes(undefined)).toBe(
      CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_DEFAULT,
    );
    expect(parseAutoSyncIntervalMinutes('90')).toBe(90);
    expect(() => parseAutoSyncIntervalMinutes('4')).toThrow(
      /CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES/,
    );
    expect(() => parseAutoSyncIntervalMinutes('1.5')).toThrow(
      /CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES/,
    );
  });

  it('due / not due com relógio fake', () => {
    const last = new Date('2026-08-18T12:00:00.000Z');
    expect(
      isAutoSyncDue({
        lastSuccessfulSyncAt: last,
        now: new Date('2026-08-18T12:59:00.000Z'),
        intervalMs: 60 * 60 * 1000,
      }),
    ).toBe(false);
    expect(
      isAutoSyncDue({
        lastSuccessfulSyncAt: last,
        now: new Date('2026-08-18T13:00:00.000Z'),
        intervalMs: 60 * 60 * 1000,
      }),
    ).toBe(true);
  });

  it('manual recente adia a automática', () => {
    expect(
      resolveAutoSyncSkipReason({
        ...eligibleBase(),
        lastSuccessfulSyncAt: new Date('2026-08-18T12:50:00.000Z'),
        now: new Date('2026-08-18T13:10:00.000Z'),
      }),
    ).toBe('not_due');
  });

  it('jitter é determinístico e cabe em 60s', () => {
    const first = autoSyncSpreadDelayMs(INTEGRATION_ID, 60 * 60 * 1000);
    const second = autoSyncSpreadDelayMs(INTEGRATION_ID, 60 * 60 * 1000);
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(60_000);
    expect(autoSyncSpreadDelayMs('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 60 * 60 * 1000)).not.toBe(
      first,
    );
  });

  it('skipa disconnected, disabled, error, credential, identidade e in_progress', () => {
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), tenantStatus: 'DISABLED' })).toBe(
      'tenant_disabled',
    );
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), status: 'DISCONNECTED' })).toBe(
      'disconnected',
    );
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), status: 'ERROR' })).toBe('error');
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), hasCredential: false })).toBe(
      'credential_missing',
    );
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), externalAccountId: null })).toBe(
      'external_account_missing',
    );
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), lastSuccessfulSyncAt: null })).toBe(
      'no_baseline',
    );
    expect(resolveAutoSyncSkipReason({ ...eligibleBase(), hasActiveRun: true })).toBe(
      'in_progress',
    );
    expect(
      resolveAutoSyncSkipReason({
        ...eligibleBase(),
        cursors: [{ externalAccountId: 'other-erp' }],
      }),
    ).toBe('identity_changed');
    expect(resolveAutoSyncSkipReason(eligibleBase())).toBeNull();
  });

  it('reconnect com a mesma identidade não é mismatch', () => {
    expect(cursorsHaveIdentityMismatch([{ externalAccountId: 'erp-1' }], 'erp-1')).toBe(false);
    expect(cursorsHaveIdentityMismatch([{ externalAccountId: 'erp-1' }], 'erp-2')).toBe(true);
  });
});
