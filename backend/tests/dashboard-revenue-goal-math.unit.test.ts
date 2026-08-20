import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  calculateRevenueGoalProgress,
  listRevenueGoalHistoryMonthKeys,
  parseRevenueGoalTargetAmount,
  revenueGoalMonthPhase,
  shiftRevenueGoalMonthKey,
} from '../src/modules/dashboard/domain/revenue-goal-math.js';

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe('calculateRevenueGoalProgress — semântica temporal', () => {
  it('sem meta retorna NO_TARGET com derivados nulos', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-08',
      target: null,
      actual: decimal('1200'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('NO_TARGET');
    expect(progress.target).toBeNull();
    expect(progress.achievementRate).toBeNull();
    expect(progress.remaining).toBeNull();
    expect(progress.exceeded).toBeNull();
  });

  it('mês atual abaixo da meta → IN_PROGRESS', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-08',
      target: decimal('100'),
      actual: decimal('76'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('IN_PROGRESS');
    expect(progress.remaining!.equals(24)).toBe(true);
  });

  it('mês atual atingido → ACHIEVED', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-08',
      target: decimal('100'),
      actual: decimal('100'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('ACHIEVED');
  });

  it('mês atual superado → EXCEEDED', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-08',
      target: decimal('100'),
      actual: decimal('150'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('EXCEEDED');
    expect(progress.exceeded!.equals(50)).toBe(true);
  });

  it('mês passado abaixo da meta → NOT_ACHIEVED (não IN_PROGRESS)', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-07',
      target: decimal('100'),
      actual: decimal('76'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('NOT_ACHIEVED');
    expect(progress.remaining!.equals(24)).toBe(true);
  });

  it('mês passado atingido → ACHIEVED', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-07',
      target: decimal('100'),
      actual: decimal('100'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('ACHIEVED');
  });

  it('mês passado superado → EXCEEDED', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-07',
      target: decimal('100'),
      actual: decimal('120'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('EXCEEDED');
  });

  it('mês futuro com meta → PLANNED mesmo com realizado abaixo', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-09',
      target: decimal('100'),
      actual: decimal('40'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('PLANNED');
    expect(progress.achievementRate!.equals(40)).toBe(true);
  });

  it('mês futuro com títulos já lançados acima da meta → PLANNED (não EXCEEDED)', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-09',
      target: decimal('100'),
      actual: decimal('200'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('PLANNED');
    expect(progress.exceeded!.equals(100)).toBe(true);
  });

  it('mês futuro sem meta → NO_TARGET', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-09',
      target: null,
      actual: decimal('50'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.status).toBe('NO_TARGET');
  });

  it('fórmulas remaining/exceeded/rate permanecem Decimal-safe', () => {
    const progress = calculateRevenueGoalProgress({
      monthKey: '2026-08',
      target: decimal('300'),
      actual: decimal('100'),
      referenceMonthKey: '2026-08',
    });
    expect(progress.achievementRate!.equals(decimal('100').div(300).times(100))).toBe(true);
    expect(progress.remaining!.equals(200)).toBe(true);
    expect(progress.exceeded!.equals(0)).toBe(true);
  });
});

describe('revenueGoalMonthPhase', () => {
  it('classifica passado/atual/futuro', () => {
    expect(revenueGoalMonthPhase('2026-07', '2026-08')).toBe('past');
    expect(revenueGoalMonthPhase('2026-08', '2026-08')).toBe('current');
    expect(revenueGoalMonthPhase('2026-09', '2026-08')).toBe('future');
  });
});

describe('parseRevenueGoalTargetAmount', () => {
  it('aceita decimal-string positivo', () => {
    expect(parseRevenueGoalTargetAmount('180000.00')!.equals(180000)).toBe(true);
  });

  it('recusa zero e inválidos', () => {
    for (const raw of ['0', '-1', 'NaN', '', 180000, null]) {
      expect(parseRevenueGoalTargetAmount(raw)).toBeNull();
    }
  });
});

describe('competências do histórico', () => {
  it('desloca e lista N competências', () => {
    expect(shiftRevenueGoalMonthKey('2026-01', -1)).toBe('2025-12');
    expect(listRevenueGoalHistoryMonthKeys('2026-03', 3)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });
});
