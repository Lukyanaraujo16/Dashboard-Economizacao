import { describe, expect, it } from 'vitest';

import {
  goalProgressStatusFromApi,
  presentApiGoalProgress,
  presentGoalProgress,
  revenueGoalHistoryCaption,
  revenueGoalStatusLabel,
  toRevenueGoalTargetDecimal,
} from '../src/components/dashboard/v2/revenue-goal-math';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';

describe('presentGoalProgress', () => {
  it('meta null → unconfigured', () => {
    const view = presentGoalProgress('1200', null);
    expect(view.status).toBe('unconfigured');
    expect(view.progressPct).toBeNull();
    expect(view.achievementPercentLabel).toBeNull();
    expect(view.remainingLabel).toBeNull();
    expect(view.exceededLabel).toBeNull();
  });

  it('meta zero → unconfigured', () => {
    const view = presentGoalProgress('1200', '0');
    expect(view.status).toBe('unconfigured');
    expect(view.progressPct).toBeNull();
  });

  it('abaixo da meta → behind com remaining', () => {
    const view = presentGoalProgress('50', '100');
    expect(view.status).toBe('behind');
    expect(view.statusLabel).toBe('Em andamento');
    expect(view.achievementPercentLabel).toBe('50,0%');
    expect(view.remainingLabel).toMatch(/R\$\s*50,00/);
    expect(view.exceededLabel).toBeNull();
    expect(view.progressPct).toBe(50);
    expect(Number.isFinite(view.progressPct)).toBe(true);
  });

  it('igual à meta → met', () => {
    const view = presentGoalProgress('100', '100');
    expect(view.status).toBe('met');
    expect(view.statusLabel).toBe('Meta atingida');
    expect(view.achievementPercentLabel).toBe('100,0%');
    expect(view.remainingLabel).toMatch(/R\$\s*0,00/);
    expect(view.exceededLabel).toBeNull();
    expect(view.progressPct).toBe(100);
  });

  it('acima da meta → exceeded', () => {
    const view = presentGoalProgress('150', '100');
    expect(view.status).toBe('exceeded');
    expect(view.statusLabel).toBe('Meta superada');
    expect(view.achievementPercentLabel).toBe('150,0%');
    expect(view.remainingLabel).toBeNull();
    expect(view.exceededLabel).toMatch(/R\$\s*50,00/);
    expect(view.progressPct).toBe(150);
    expect(Number.isFinite(view.progressPct)).toBe(true);
  });

  it('não produz NaN em nenhum campo numérico derivado', () => {
    for (const [realized, target] of [
      ['0', null],
      ['0', '0'],
      ['10', '0'],
      ['0', '100'],
      ['100', '100'],
      ['250', '100'],
      ['33.33', '100'],
    ] as const) {
      const view = presentGoalProgress(realized, target);
      if (view.progressPct !== null) {
        expect(Number.isNaN(view.progressPct)).toBe(false);
        expect(Number.isFinite(view.progressPct)).toBe(true);
      }
    }
  });
});

function snapshot(overrides: Partial<RevenueGoalSnapshot>): RevenueGoalSnapshot {
  return {
    monthKey: '2026-08',
    target: '100',
    actual: '76',
    achievementRate: '76',
    remaining: '24',
    exceeded: '0',
    status: 'IN_PROGRESS',
    history: [],
    ...overrides,
  };
}

describe('goalProgressStatusFromApi', () => {
  it('mapeia os status temporais da API para o vocabulário do widget', () => {
    expect(goalProgressStatusFromApi('NO_TARGET')).toBe('unconfigured');
    expect(goalProgressStatusFromApi('IN_PROGRESS')).toBe('behind');
    expect(goalProgressStatusFromApi('NOT_ACHIEVED')).toBe('missed');
    expect(goalProgressStatusFromApi('ACHIEVED')).toBe('met');
    expect(goalProgressStatusFromApi('EXCEEDED')).toBe('exceeded');
    expect(goalProgressStatusFromApi('PLANNED')).toBe('planned');
  });
});

describe('revenueGoalStatusLabel / historyCaption', () => {
  it('usa copy humana sem linguagem agressiva', () => {
    expect(revenueGoalStatusLabel('IN_PROGRESS')).toBe('Em andamento');
    expect(revenueGoalStatusLabel('NOT_ACHIEVED')).toBe('Meta não atingida');
    expect(revenueGoalStatusLabel('PLANNED')).toBe('Meta planejada');
    expect(revenueGoalStatusLabel('ACHIEVED')).toBe('Meta atingida');
    expect(revenueGoalStatusLabel('EXCEEDED')).toBe('Meta superada');
    expect(revenueGoalHistoryCaption('IN_PROGRESS')).toBe('progresso atual');
    expect(revenueGoalHistoryCaption('NOT_ACHIEVED')).toBe('abaixo da meta');
    expect(revenueGoalHistoryCaption('ACHIEVED')).toBe('✓ atingida');
    expect(revenueGoalHistoryCaption('EXCEEDED')).toBe('superada');
    expect(revenueGoalHistoryCaption('PLANNED')).toBe('planejada');
  });
});

describe('presentApiGoalProgress', () => {
  it('NO_TARGET não inventa derivados', () => {
    const view = presentApiGoalProgress(
      snapshot({
        target: null,
        achievementRate: null,
        remaining: null,
        exceeded: null,
        status: 'NO_TARGET',
      }),
    );
    expect(view.status).toBe('unconfigured');
    expect(view.progressPct).toBeNull();
    expect(view.remainingLabel).toBeNull();
  });

  it('mês atual abaixo → Em andamento', () => {
    const view = presentApiGoalProgress(snapshot({}));
    expect(view.status).toBe('behind');
    expect(view.statusLabel).toBe('Em andamento');
    expect(view.achievementPercentLabel).toBe('76,0%');
    expect(view.remainingLabel).toMatch(/R\$\s*24,00/);
    expect(view.exceededLabel).toBeNull();
    expect(view.progressPct).toBe(76);
  });

  it('mês passado abaixo → Meta não atingida', () => {
    const view = presentApiGoalProgress(
      snapshot({
        monthKey: '2026-07',
        status: 'NOT_ACHIEVED',
      }),
    );
    expect(view.status).toBe('missed');
    expect(view.statusLabel).toBe('Meta não atingida');
    expect(view.remainingLabel).toMatch(/R\$\s*24,00/);
  });

  it('mês futuro com meta → Meta planejada (sem julgamento de excesso)', () => {
    const view = presentApiGoalProgress(
      snapshot({
        monthKey: '2026-09',
        actual: '200',
        achievementRate: '200',
        remaining: '0',
        exceeded: '100',
        status: 'PLANNED',
      }),
    );
    expect(view.status).toBe('planned');
    expect(view.statusLabel).toBe('Meta planejada');
    expect(view.exceededLabel).toBeNull();
    expect(view.remainingLabel).toBeNull();
  });

  it('EXCEEDED mostra o excedente e não o restante', () => {
    const view = presentApiGoalProgress(
      snapshot({
        actual: '150',
        achievementRate: '150',
        remaining: '0',
        exceeded: '50',
        status: 'EXCEEDED',
      }),
    );
    expect(view.status).toBe('exceeded');
    expect(view.statusLabel).toBe('Meta superada');
    expect(view.exceededLabel).toMatch(/R\$\s*50,00/);
    expect(view.progressPct).toBe(150);
  });

  it('ACHIEVED zera o excedente exibido', () => {
    const view = presentApiGoalProgress(
      snapshot({
        actual: '100',
        achievementRate: '100',
        remaining: '0',
        exceeded: '0',
        status: 'ACHIEVED',
      }),
    );
    expect(view.status).toBe('met');
    expect(view.statusLabel).toBe('Meta atingida');
    expect(view.exceededLabel).toBeNull();
    expect(view.achievementPercentLabel).toBe('100,0%');
  });
});

describe('toRevenueGoalTargetDecimal', () => {
  it('aceita formato pt-BR e decimal puro', () => {
    expect(toRevenueGoalTargetDecimal('180.000,00')).toBe('180000.00');
    expect(toRevenueGoalTargetDecimal('180000.00')).toBe('180000.00');
    expect(toRevenueGoalTargetDecimal('R$ 1.234,56')).toBe('1234.56');
    expect(toRevenueGoalTargetDecimal('180000')).toBe('180000');
    expect(toRevenueGoalTargetDecimal('1.234.567')).toBe('1234567');
    expect(toRevenueGoalTargetDecimal('  250,5 ')).toBe('250.5');
  });

  it('recusa zero, vazio e texto sem número', () => {
    for (const raw of ['', '0', '0,00', 'abc', 'R$', ',', '-10']) {
      expect(toRevenueGoalTargetDecimal(raw)).toBeNull();
    }
  });
});
