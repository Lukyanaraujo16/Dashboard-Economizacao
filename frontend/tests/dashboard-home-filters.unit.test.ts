import { describe, expect, it } from 'vitest';

import {
  dashboardCashFlowForecastPath,
  dashboardExecutiveInsightsPath,
  dashboardMonthEndCashPressurePath,
  dashboardMonthlyExpensesPath,
  dashboardMonthlyRevenuePath,
  dashboardRevenueGoalPath,
} from '../src/lib/api-config';
import { buildDashboardCostCenterSearchParams } from '../src/lib/dashboard-cost-center';
import {
  buildDashboardCategorySearchParams,
  DASHBOARD_CATEGORY_ALL_LABEL,
  groupDashboardCategories,
  isValidDashboardCategoryId,
  parseDashboardCategoryFromSearchParams,
} from '../src/lib/dashboard-category';
import {
  dashboardCashWindowCacheKey,
  dashboardFilterCacheKey,
} from '../src/lib/dashboard-filter-cache';
import { buildDashboardMonthSearchParams } from '../src/lib/dashboard-month';
import {
  buildDashboardSituationSearchParams,
  isDashboardSituation,
  parseDashboardSituationFromSearchParams,
  resolveSelectedDashboardSituation,
} from '../src/lib/dashboard-situation';

const CENTER = '11111111-1111-4111-8111-111111111111';
const CATEGORY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('dashboard situation URL', () => {
  it('parseia settled/open/overdue e omite default', () => {
    expect(parseDashboardSituationFromSearchParams(new URLSearchParams())).toBeNull();
    expect(
      parseDashboardSituationFromSearchParams(new URLSearchParams('situation=settled')),
    ).toBe('settled');
    expect(parseDashboardSituationFromSearchParams(new URLSearchParams('situation=open'))).toBe(
      'open',
    );
    expect(
      parseDashboardSituationFromSearchParams(new URLSearchParams('situation=overdue')),
    ).toBe('overdue');
    expect(resolveSelectedDashboardSituation(new URLSearchParams('situation=PAID'))).toBeNull();
    expect(isDashboardSituation('PAID')).toBe(false);
    expect(isDashboardSituation('OVERDUE')).toBe(false);
  });

  it('set/remove preserva month e costCenter', () => {
    const base = new URLSearchParams(`month=2026-07&costCenter=${CENTER}`);
    const set = buildDashboardSituationSearchParams(base, 'settled');
    expect(set.get('situation')).toBe('settled');
    expect(set.get('month')).toBe('2026-07');
    expect(set.get('costCenter')).toBe(CENTER);
    const cleared = buildDashboardSituationSearchParams(set, null);
    expect(cleared.get('situation')).toBeNull();
    expect(cleared.get('month')).toBe('2026-07');
  });
});

describe('dashboard category URL', () => {
  it('exige UUID na query e remove Todas', () => {
    expect(isValidDashboardCategoryId(CATEGORY)).toBe(true);
    expect(isValidDashboardCategoryId('not-a-uuid')).toBe(false);
    expect(parseDashboardCategoryFromSearchParams(new URLSearchParams())).toBeNull();
    expect(
      parseDashboardCategoryFromSearchParams(new URLSearchParams(`category=${CATEGORY}`)),
    ).toBe(CATEGORY);
    expect(
      parseDashboardCategoryFromSearchParams(new URLSearchParams('category=bad')),
    ).toBeNull();
    const withAll = buildDashboardCategorySearchParams(
      new URLSearchParams(`month=2026-07&category=${CATEGORY}`),
      null,
    );
    expect(withAll.get('category')).toBeNull();
    expect(withAll.get('month')).toBe('2026-07');
  });

  it('agrupa Receita, Despesa e Não classificadas sem inventar Sem categoria', () => {
    const groups = groupDashboardCategories([
      { id: CATEGORY, name: 'Serviços', type: 'REVENUE' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Folha', type: 'EXPENSE' },
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Ajuste', type: 'UNKNOWN' },
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Categorias de receita',
      'Categorias de despesa',
      'Não classificadas',
    ]);
    expect(DASHBOARD_CATEGORY_ALL_LABEL).toBe('Todas as categorias');
  });

  it('coexiste com month, costCenter e situation', () => {
    let params = new URLSearchParams();
    params = buildDashboardMonthSearchParams(params, '2026-07', '2026-08');
    params = buildDashboardCostCenterSearchParams(params, CENTER);
    params = buildDashboardSituationSearchParams(params, 'open');
    params = buildDashboardCategorySearchParams(params, CATEGORY);
    expect(params.get('month')).toBe('2026-07');
    expect(params.get('costCenter')).toBe(CENTER);
    expect(params.get('situation')).toBe('open');
    expect(params.get('category')).toBe(CATEGORY);
  });
});

describe('dashboard filter cache e query paths', () => {
  it('chave inclui tenant, situation e category de forma determinística', () => {
    const TENANT = '33333333-3333-4333-8333-333333333333';
    expect(dashboardFilterCacheKey(TENANT, '2026-08', null)).toBe(`${TENANT}|2026-08|||`);
    expect(dashboardFilterCacheKey(TENANT, '2026-08', CENTER, 'settled', CATEGORY)).toBe(
      `${TENANT}|2026-08|${CENTER}|settled|${CATEGORY}`,
    );
    expect(dashboardCashWindowCacheKey(TENANT, CENTER, CATEGORY)).toBe(
      `${TENANT}|${CENTER}|${CATEGORY}`,
    );
    expect(dashboardCashWindowCacheKey(TENANT, CENTER, null)).toBe(`${TENANT}|${CENTER}|`);
  });

  it('monthly/insights enviam os 4 params; forecast/pressão só category; meta nenhum slice', () => {
    const monthly = dashboardMonthlyRevenuePath('2026-07', CENTER, 'settled', CATEGORY);
    expect(monthly).toContain('month=2026-07');
    expect(monthly).toContain('costCenter=');
    expect(monthly).toContain('situation=settled');
    expect(monthly).toContain(`category=${CATEGORY}`);
    expect(dashboardMonthlyExpensesPath('2026-07', CENTER, 'open', CATEGORY)).toContain(
      'situation=open',
    );
    expect(dashboardExecutiveInsightsPath('2026-07', CENTER, 'overdue', CATEGORY)).toContain(
      'situation=overdue',
    );

    const forecast = dashboardCashFlowForecastPath(CENTER, CATEGORY);
    expect(forecast).toContain(`category=${CATEGORY}`);
    expect(forecast).not.toContain('situation=');
    const pressure = dashboardMonthEndCashPressurePath(CENTER, CATEGORY);
    expect(pressure).toContain(`category=${CATEGORY}`);
    expect(pressure).not.toContain('situation=');

    expect(dashboardRevenueGoalPath('2026-07')).not.toContain('costCenter=');
    expect(dashboardRevenueGoalPath('2026-07')).not.toContain('situation=');
    expect(dashboardRevenueGoalPath('2026-07')).not.toContain('category=');
  });
});

describe('dashboard home filters layout', () => {
  it('empilha controles no mobile e mantém centro de custo em linha própria', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const pageCss = await readFile(
      join(here, '../src/components/dashboard/dashboard-page.module.css'),
      'utf8',
    );
    const situationCss = await readFile(
      join(here, '../src/components/dashboard/dashboard-situation-selector.module.css'),
      'utf8',
    );
    const categoryCss = await readFile(
      join(here, '../src/components/dashboard/dashboard-category-selector.module.css'),
      'utf8',
    );
    expect(pageCss).toMatch(/\.controlsCluster \{[\s\S]*flex-wrap:\s*wrap/);
    expect(pageCss).toMatch(/\.costCenterRow \{/);
    expect(pageCss).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.controlsCluster/);
    const desktopCss = pageCss.split('@media')[0] ?? '';
    expect(desktopCss).toMatch(/\.freshnessPill \{[\s\S]*display:\s*inline-flex/);
    expect(desktopCss).not.toMatch(/flex:\s*1 1 100%/);
    expect(desktopCss).not.toMatch(/justify-content:\s*center/);
    expect(pageCss).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.freshnessPill \{[\s\S]*flex:\s*1 1 100%/,
    );
    expect(pageCss).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.freshnessPill \{[\s\S]*max-width:\s*100%/,
    );
    expect(pageCss).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.freshnessPill \{[\s\S]*justify-content:\s*center/,
    );
    expect(situationCss).toMatch(/@media \(max-width: 767px\) \{[\s\S]*flex:\s*1 1/);
    expect(categoryCss).toMatch(/@media \(max-width: 767px\) \{[\s\S]*flex:\s*1 1/);
    expect(categoryCss).toMatch(/\.root \{[\s\S]*width:\s*11rem/);
    expect(categoryCss).toMatch(/\.root \{[\s\S]*max-width:\s*16rem/);
    expect(categoryCss).toMatch(/\.trigger \{[\s\S]*height:\s*2\.25rem[\s\S]*max-height:\s*2\.25rem/);
    expect(categoryCss).toMatch(/\.trigger \{[\s\S]*white-space:\s*nowrap/);
    expect(categoryCss).toMatch(/\.trigger \{[\s\S]*overflow:\s*hidden/);
    expect(categoryCss).toMatch(
      /\.triggerText \{[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/,
    );
    expect(categoryCss).toMatch(/\.triggerText \{[\s\S]*flex:\s*1 1 0/);
    expect(categoryCss).toMatch(/right:\s*0/);
    expect(categoryCss).toMatch(/width:\s*min\(20rem, calc\(100vw - 2rem\)\)/);
    expect(categoryCss).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.root \{[\s\S]*max-width:\s*100%/,
    );
  });
});
