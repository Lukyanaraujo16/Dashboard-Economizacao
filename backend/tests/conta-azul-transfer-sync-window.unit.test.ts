import { describe, expect, it } from 'vitest';

import { buildTransferSyncCivilWindow, formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

describe('buildTransferSyncCivilWindow (10-B)', () => {
  it('full — mesmo horizonte MVP do ledger/AR (5y lookback + 2y lookahead)', () => {
    const now = new Date('2026-09-05T15:30:00.000Z');
    const window = buildTransferSyncCivilWindow({
      now,
      mode: 'full',
      lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
      lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
    });
    expect(formatCivilDate(window.from)).toBe('2021-09-05');
    expect(formatCivilDate(window.to)).toBe('2028-09-05');
  });

  it('recurring — lookback inclusivo de CONTA_AZUL_SYNC_WINDOW_DAYS até hoje civil UTC', () => {
    const now = new Date('2026-09-05T18:00:00.000Z');
    const window = buildTransferSyncCivilWindow({
      now,
      mode: 'recurring',
      recurringLookbackDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    expect(formatCivilDate(window.to)).toBe('2026-09-05');
    expect(formatCivilDate(window.from)).toBe('2026-06-08');
    const spanDays =
      (window.to.getTime() - window.from.getTime()) / (24 * 60 * 60 * 1000) + 1;
    expect(spanDays).toBe(CONTA_AZUL_SYNC_WINDOW_DAYS);
  });

  it('recurring — transferência 31/08 criada em 05/09 cai na janela de 90d', () => {
    const now = new Date('2026-09-05T12:00:00.000Z');
    const window = buildTransferSyncCivilWindow({
      now,
      mode: 'recurring',
      recurringLookbackDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
    });
    const retro = new Date('2026-08-31T00:00:00.000Z');
    expect(retro.getTime()).toBeGreaterThanOrEqual(window.from.getTime());
    expect(retro.getTime()).toBeLessThanOrEqual(window.to.getTime());
  });

  it('datas civis usam o mesmo utilitário UTC do restante do sync (não inventa fuso paralelo)', () => {
    // 03/09 22:00 UTC ainda é 03/09 civil UTC — alinhado a buildDueDateWindows.
    const now = new Date('2026-09-03T22:00:00.000Z');
    const window = buildTransferSyncCivilWindow({ now, mode: 'recurring', recurringLookbackDays: 7 });
    expect(formatCivilDate(window.to)).toBe('2026-09-03');
    expect(formatCivilDate(window.from)).toBe('2026-08-28');
  });
});
