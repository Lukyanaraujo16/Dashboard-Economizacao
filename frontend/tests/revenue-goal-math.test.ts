import { describe, expect, it } from 'vitest';

import { presentGoalProgress } from '../src/components/dashboard/v2/revenue-goal-math';

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
    expect(view.achievementPercentLabel).toBe('50,0%');
    expect(view.remainingLabel).toMatch(/R\$\s*50,00/);
    expect(view.exceededLabel).toBeNull();
    expect(view.progressPct).toBe(50);
    expect(Number.isFinite(view.progressPct)).toBe(true);
  });

  it('igual à meta → met', () => {
    const view = presentGoalProgress('100', '100');
    expect(view.status).toBe('met');
    expect(view.achievementPercentLabel).toBe('100,0%');
    expect(view.remainingLabel).toMatch(/R\$\s*0,00/);
    expect(view.exceededLabel).toBeNull();
    expect(view.progressPct).toBe(100);
  });

  it('acima da meta → exceeded', () => {
    const view = presentGoalProgress('150', '100');
    expect(view.status).toBe('exceeded');
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
