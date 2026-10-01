import { describe, expect, it, vi } from 'vitest';

import { runAfterSyncSuccess } from '../src/modules/integrations/conta-azul/domain/after-sync-success.js';
import {
  isCurrentCivilMonth,
  scheduleProactiveEvaluationForSavedMonth,
} from '../src/modules/advisor/domain/schedule-proactive-evaluation.js';
import { isDuplicateBullmqJob } from '../src/infrastructure/jobs/proactive-evaluation.queue.js';
import { runProactiveTenantEvaluation } from '../src/modules/advisor/services/proactive-evaluation.service.js';
import type { ProactiveTriggerEngine } from '../src/modules/advisor/services/proactive-trigger-engine.service.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');

describe('agendamento da avaliação proativa', () => {
  it('reconhece somente o mês civil corrente', () => {
    expect(isCurrentCivilMonth('2026-10', NOW)).toBe(true);
    expect(isCurrentCivilMonth('2026-11', NOW)).toBe(false);
    expect(isCurrentCivilMonth('2026-09', NOW)).toBe(false);
  });

  it('enfileira meta ou teto do mês corrente e ignora mês futuro ou passado', async () => {
    const schedule = vi.fn(async () => undefined);
    await scheduleProactiveEvaluationForSavedMonth({
      monthKey: '2026-10',
      now: NOW,
      tenantId: 'tenant-a',
      schedule,
    });
    await scheduleProactiveEvaluationForSavedMonth({
      monthKey: '2026-11',
      now: NOW,
      tenantId: 'tenant-a',
      schedule,
    });
    await scheduleProactiveEvaluationForSavedMonth({
      monthKey: '2026-09',
      now: NOW,
      tenantId: 'tenant-a',
      schedule,
    });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith('tenant-a');
  });

  it('falha ao enfileirar não desfaz o salvamento', async () => {
    await expect(
      scheduleProactiveEvaluationForSavedMonth({
        monthKey: '2026-10',
        now: NOW,
        tenantId: 'tenant-a',
        schedule: async () => {
          throw new Error('fila indisponível');
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('sync bem-sucedido enfileira e sync com falha não chama o gancho', async () => {
    const schedule = vi.fn(async () => undefined);
    await runAfterSyncSuccess('tenant-a', schedule);
    expect(schedule).toHaveBeenCalledWith('tenant-a');
    expect(
      runAfterSyncSuccess('tenant-a', async () => {
        throw new Error('redis');
      }),
    ).resolves.toBeUndefined();
  });

  it('reconhece job duplicado da fila', () => {
    expect(isDuplicateBullmqJob(new Error('Job already exists'))).toBe(true);
    expect(isDuplicateBullmqJob(new Error('conexão recusada'))).toBe(false);
  });

  it('avaliação sem fato qualificado não enfileira redação e falha da avaliação não é engolida', async () => {
    const enqueue = vi.fn(async () => undefined);
    const quiet: ProactiveTriggerEngine = {
      async evaluate() {
        return { evaluated: 2, created: 0, reused: 0, occurrences: [] };
      },
    };
    await expect(
      runProactiveTenantEvaluation(
        {
          engine: quiet,
          insights: { async listAwaitingNarration() { return []; } },
          enqueueNarration: enqueue,
        },
        'tenant-a',
      ),
    ).resolves.toMatchObject({ created: 0, narrationQueued: 0 });
    expect(enqueue).not.toHaveBeenCalled();

    const failing: ProactiveTriggerEngine = {
      async evaluate() {
        throw new Error('leitura indisponível');
      },
    };
    await expect(
      runProactiveTenantEvaluation(
        {
          engine: failing,
          insights: { async listAwaitingNarration() { return []; } },
          enqueueNarration: enqueue,
        },
        'tenant-a',
      ),
    ).rejects.toThrow('leitura indisponível');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enfileira redação dos insights que ainda aguardam, uma vez por insight', async () => {
    const enqueue = vi.fn(async () => undefined);
    const engine: ProactiveTriggerEngine = {
      async evaluate() {
        return { evaluated: 1, created: 1, reused: 0, occurrences: [] };
      },
    };
    await runProactiveTenantEvaluation(
      {
        engine,
        insights: {
          async listAwaitingNarration() {
            return [{ id: 'insight-1' } as never];
          },
        },
        enqueueNarration: enqueue,
      },
      'tenant-certo',
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('insight-1');
  });
});
