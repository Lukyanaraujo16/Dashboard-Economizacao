import { describe, expect, it } from 'vitest';

import {
  ANALYTICAL_CAPABILITY_REGISTRY,
  ANALYTICAL_DIMENSION_KEYS,
  ANALYTICAL_DIMENSION_REGISTRY,
  ANALYTICAL_METRIC_KEYS,
  ANALYTICAL_METRIC_REGISTRY,
  ANALYTICAL_OPERATION_KEYS,
  ANALYTICAL_OPERATION_REGISTRY,
  ANALYTICAL_QUERY_FORBIDDEN_KEYS,
  isValidAnalyticalCoverageRatio,
  listAnalyticalCapabilities,
  parseAnalyticalQueryBoundary,
  validateAnalyticalCapability,
  type AnalyticalQuery,
} from '../src/modules/advisor/domain/analytical/index.js';

function month(monthKey: string) {
  return { kind: 'MONTH' as const, monthKey };
}

function ytd(year: number) {
  return { kind: 'YTD' as const, year, rangeKey: `${year}-YTD` };
}

function yearPeriod(year: number) {
  return {
    kind: 'YEAR' as const,
    year,
    rangeKey: String(year),
    isPartialYear: false as const,
  };
}

function comparison(leftMonth: string, rightMonth: string) {
  return {
    kind: 'COMPARISON' as const,
    left: month(leftMonth),
    right: month(rightMonth),
  };
}

function current() {
  return {
    kind: 'CURRENT' as const,
    asOf: new Date('2026-09-29T15:00:00.000Z'),
    timeZone: 'America/Sao_Paulo' as const,
  };
}

describe('F13.8.5A Metric Registry', () => {
  it('lista somente métricas comprovadas', () => {
    expect(ANALYTICAL_METRIC_REGISTRY.map((m) => m.key).sort()).toEqual(
      [...ANALYTICAL_METRIC_KEYS].sort(),
    );
    expect(ANALYTICAL_METRIC_KEYS).not.toContain('PROFIT');
    expect(ANALYTICAL_METRIC_KEYS).not.toContain('PRODUCT_REVENUE');
  });

  it('BILLING não é FLOW / CASH', () => {
    const billing = ANALYTICAL_METRIC_REGISTRY.find((m) => m.key === 'BILLING');
    expect(billing?.semanticFamily).toBe('BILLING');
    expect(billing?.semanticFamily).not.toBe('FLOW');
  });

  it('BANK_BALANCE e FORECAST_CASH são vocabulary-only', () => {
    expect(
      ANALYTICAL_METRIC_REGISTRY.find((m) => m.key === 'BANK_BALANCE')
        ?.publicationStatus,
    ).toBe('VOCABULARY_ONLY');
    expect(
      ANALYTICAL_METRIC_REGISTRY.find((m) => m.key === 'FORECAST_CASH')
        ?.publicationStatus,
    ).toBe('VOCABULARY_ONLY');
  });
});

describe('F13.8.5A Dimension Registry', () => {
  it('não registra CUSTOMER/SUPPLIER/CONVENIO/PRODUCT como dimensão', () => {
    expect(ANALYTICAL_DIMENSION_KEYS).toEqual([
      'CATEGORY',
      'COST_CENTER',
      'COUNTERPARTY',
    ]);
    expect(ANALYTICAL_DIMENSION_REGISTRY).toHaveLength(3);
  });

  it('COUNTERPARTY documenta partyProfile como filter', () => {
    const counterparty = ANALYTICAL_DIMENSION_REGISTRY.find(
      (d) => d.key === 'COUNTERPARTY',
    );
    expect(counterparty?.notes).toMatch(/partyProfile/i);
    expect(counterparty?.identityStrategy).toBe(
      'PARTY_ID_THEN_NORMALIZED_DESCRIPTION',
    );
  });
});

describe('F13.8.5A Operation Registry', () => {
  it('não inclui AVERAGE/TREND/COUNT', () => {
    expect(ANALYTICAL_OPERATION_KEYS).not.toContain('AVERAGE');
    expect(ANALYTICAL_OPERATION_KEYS).not.toContain('TREND');
    expect(ANALYTICAL_OPERATION_KEYS).not.toContain('COUNT');
    expect(ANALYTICAL_OPERATION_REGISTRY.map((o) => o.key).sort()).toEqual(
      [...ANALYTICAL_OPERATION_KEYS].sort(),
    );
  });

  it('RANKING_WINNER exige limit=1 na definição', () => {
    expect(
      ANALYTICAL_OPERATION_REGISTRY.find((o) => o.key === 'RANKING_WINNER')
        ?.winnerRequiresLimitOne,
    ).toBe(true);
  });
});

describe('F13.8.5A Capability Registry invariants', () => {
  it('não possui capabilities duplicadas', () => {
    const keys = listAnalyticalCapabilities().map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cada capability referencia metric/dimension/operation/family coerentes', () => {
    for (const capability of listAnalyticalCapabilities()) {
      const metric = ANALYTICAL_METRIC_REGISTRY.find(
        (m) => m.key === capability.metric,
      );
      expect(metric).toBeDefined();
      expect(metric!.semanticFamily).toBe(capability.semanticFamily);
      for (const dimension of capability.dimensions) {
        if (dimension !== null) {
          expect(ANALYTICAL_DIMENSION_KEYS).toContain(dimension);
        }
      }
      for (const operation of capability.operations) {
        expect(ANALYTICAL_OPERATION_KEYS).toContain(operation);
      }
      if (capability.maxLimit !== null) {
        expect(capability.maxLimit).toBeGreaterThan(0);
      }
      for (const filter of [
        ...capability.allowedFilters,
        ...capability.requiredFilters,
      ]) {
        expect(['partyProfile', 'categoryReference', 'costCenterQuery']).toContain(
          filter,
        );
      }
      for (const required of capability.requiredFilters) {
        expect(capability.allowedFilters).toContain(required);
      }
      if (capability.directions !== null) {
        for (const direction of capability.directions) {
          expect(metric!.possibleDirections).toContain(direction);
        }
      }
    }
  });

  it('não publica capabilities futuras acidentais', () => {
    const caps = listAnalyticalCapabilities();
    expect(
      caps.some(
        (c) =>
          c.metric === 'BANK_BALANCE' ||
          c.metric === 'FORECAST_CASH' ||
          c.semanticFamily === 'COMPETENCE',
      ),
    ).toBe(false);
    expect(
      caps.some(
        (c) =>
          c.dimensions.includes('COUNTERPARTY') &&
          c.directions?.includes('OUTFLOW'),
      ),
    ).toBe(false);
    expect(
      caps.some(
        (c) =>
          c.dimensions.includes('COST_CENTER') &&
          (c.periodKinds.includes('YTD') || c.periodKinds.includes('YEAR')),
      ),
    ).toBe(false);
    expect(
      caps.some((c) => c.allowedFilters.includes('partyProfile')),
    ).toBe(false);
  });

  it('SHARE não tem capability standalone publicada', () => {
    expect(
      listAnalyticalCapabilities().some((c) => c.operations.includes('SHARE')),
    ).toBe(false);
  });
});

describe('F13.8.5A capability allow — published today', () => {
  it('permite nominal INFLOW MONTH/YTD/YEAR winner/topN/lookup', () => {
    for (const period of [month('2026-08'), ytd(2026), yearPeriod(2025)]) {
      for (const operation of [
        'RANKING_WINNER',
        'RANKING_TOPN',
        'LOOKUP',
      ] as const) {
        const query: AnalyticalQuery = {
          semanticFamily: 'FLOW',
          metric: 'REALIZED_CASH',
          direction: 'INFLOW',
          period,
          dimension: 'COUNTERPARTY',
          operation,
          filters: { categoryReference: 'Atendimentos Convenio' },
          ...(operation === 'LOOKUP'
            ? { identity: { kind: 'QUERY', query: 'Unimed' } }
            : {}),
          ...(operation === 'RANKING_WINNER' ? { limit: 1 } : {}),
          ...(operation === 'RANKING_TOPN' ? { limit: 5 } : {}),
        };
        const result = validateAnalyticalCapability(query);
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (result.ok) {
          expect(result.capability.executorKey).toBe('realizedCashCounterparty');
        }
      }
    }
  });

  it('permite COST_CENTER mês IN/OUT ranking/lookup/movements/compare', () => {
    const base = {
      semanticFamily: 'FLOW' as const,
      metric: 'REALIZED_CASH' as const,
      direction: 'OUTFLOW' as const,
      dimension: 'COST_CENTER' as const,
    };
    expect(
      validateAnalyticalCapability({
        ...base,
        period: month('2026-08'),
        operation: 'RANKING_TOPN',
        limit: 5,
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        ...base,
        period: month('2026-08'),
        operation: 'LOOKUP',
        filters: { costCenterQuery: 'Administrativo' },
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        ...base,
        period: comparison('2026-07', '2026-08'),
        operation: 'COMPARE',
        filters: { costCenterQuery: 'Administrativo' },
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        ...base,
        period: month('2026-08'),
        operation: 'MOVEMENTS',
        filters: { costCenterQuery: 'Administrativo' },
        limit: 10,
      }).ok,
    ).toBe(true);
  });

  it('permite category breakdown e movements mês', () => {
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        period: month('2026-08'),
        dimension: 'CATEGORY',
        operation: 'BREAKDOWN',
        limit: 5,
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        period: month('2026-08'),
        operation: 'MOVEMENTS',
        limit: 10,
      }).ok,
    ).toBe(true);
  });

  it('permite CURRENT snapshot VALUE', () => {
    for (const metric of [
      'RECEIVABLE_STOCK',
      'PAYABLE_STOCK',
      'DELINQUENCY',
    ] as const) {
      const result = validateAnalyticalCapability({
        semanticFamily: 'STOCK',
        metric,
        period: current(),
        operation: 'VALUE',
      });
      expect(result.ok).toBe(true);
    }
  });

  it('permite BILLING month VALUE e COMPARE', () => {
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'BILLING',
        metric: 'BILLING',
        period: month('2026-08'),
        operation: 'VALUE',
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'BILLING',
        metric: 'BILLING',
        period: comparison('2026-07', '2026-08'),
        operation: 'COMPARE',
      }).ok,
    ).toBe(true);
  });
});

describe('F13.8.5A capability deny — deny by default', () => {
  it('nega BANK_BALANCE + COUNTERPARTY + TOPN', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'BANK_BALANCE',
      metric: 'BANK_BALANCE',
      period: current(),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['CAPABILITY_NOT_FOUND', 'INVALID_DIMENSION']).toContain(result.reason);
    }
  });

  it('nega REALIZED_CASH OUTFLOW COUNTERPARTY YEAR winner (futuro 5D)', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'OUTFLOW',
      period: yearPeriod(2025),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_WINNER',
      limit: 1,
      filters: {
        categoryReference: 'Despesas',
        partyProfile: 'SUPPLIER',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CAPABILITY_NOT_FOUND');
    }
  });

  it('nega BILLING × COUNTERPARTY', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['CAPABILITY_NOT_FOUND', 'INVALID_DIMENSION']).toContain(result.reason);
    }
  });

  it('nega semantic family mismatch', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'BILLING',
      period: month('2026-08'),
      operation: 'VALUE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('SEMANTIC_FAMILY_MISMATCH');
    }
  });

  it('nega direção inválida NET em REALIZED_CASH dimensional', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'NET',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 5,
      filters: { categoryReference: 'x' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_DIRECTION');
    }
  });

  it('nega period incompatível YTD em COST_CENTER', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'OUTFLOW',
      period: ytd(2026),
      dimension: 'COST_CENTER',
      operation: 'RANKING_TOPN',
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CAPABILITY_NOT_FOUND');
    }
  });

  it('nega comparison YEAR×YEAR', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: {
        kind: 'COMPARISON',
        left: yearPeriod(2024),
        right: yearPeriod(2025),
      },
      operation: 'COMPARE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CAPABILITY_NOT_FOUND');
    }
  });

  it('nega filter partyProfile ainda não publicado', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 5,
      filters: {
        categoryReference: 'Atendimentos Convenio',
        partyProfile: 'CUSTOMER',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CAPABILITY_NOT_FOUND');
    }
  });

  it('nega winner com limit != 1', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_WINNER',
      limit: 3,
      filters: { categoryReference: 'Atendimentos Convenio' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('WINNER_LIMIT_MUST_BE_ONE');
    }
  });

  it('permite topN acima do teto (clamp legado no executor/serviço)', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 99,
      filters: { categoryReference: 'Atendimentos Convenio' },
    });
    expect(result.ok).toBe(true);
  });

  it('nega LOOKUP sem identity', () => {
    const result = validateAnalyticalCapability({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: month('2026-08'),
      dimension: 'COUNTERPARTY',
      operation: 'LOOKUP',
      filters: { categoryReference: 'Atendimentos Convenio' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('IDENTITY_REQUIRED');
    }
  });
});

describe('F13.8.5A security contract', () => {
  it('rejeita campos proibidos na fronteira', () => {
    for (const field of [
      'tenantId',
      'userId',
      'sql',
      'table',
      'prisma',
      'from',
      'to',
      'url',
      'datasource',
    ]) {
      const parsed = parseAnalyticalQueryBoundary({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        period: { kind: 'MONTH', monthKey: '2026-08' },
        operation: 'VALUE',
        [field]: 'evil',
      });
      expect(parsed.ok, field).toBe(false);
      if (!parsed.ok) {
        expect(['FORBIDDEN_FIELD', 'UNKNOWN_FIELD']).toContain(parsed.reason);
      }
    }
  });

  it('rejeita filter keys arbitrárias', () => {
    const parsed = parseAnalyticalQueryBoundary({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: { kind: 'MONTH', monthKey: '2026-08' },
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_TOPN',
      limit: 5,
      filters: { categoryReference: 'x', rawWhere: '1=1' },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toBe('INVALID_FILTER');
    }
  });

  it('lista explícita de forbidden keys cobre superfície sensível', () => {
    const lowered = ANALYTICAL_QUERY_FORBIDDEN_KEYS.map((k) => k.toLowerCase());
    for (const required of [
      'tenantid',
      'userid',
      'sql',
      'table',
      'prisma',
      'from',
      'to',
      'url',
      'datasource',
    ]) {
      expect(lowered).toContain(required);
    }
  });

  it('parse válido + validate fecha caminho publicado', () => {
    const parsed = parseAnalyticalQueryBoundary({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'INFLOW',
      period: { kind: 'YEAR', year: 2025, rangeKey: '2025', isPartialYear: false },
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_WINNER',
      limit: 1,
      filters: { categoryReference: 'Atendimentos Convenio' },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(validateAnalyticalCapability(parsed.query).ok).toBe(true);
    }
  });
});

describe('F13.8.5A coverage contract', () => {
  it('ratio ∈ [0,1] ou null', () => {
    expect(isValidAnalyticalCoverageRatio(null)).toBe(true);
    expect(isValidAnalyticalCoverageRatio(0)).toBe(true);
    expect(isValidAnalyticalCoverageRatio(1)).toBe(true);
    expect(isValidAnalyticalCoverageRatio(0.42)).toBe(true);
    expect(isValidAnalyticalCoverageRatio(1.01)).toBe(false);
    expect(isValidAnalyticalCoverageRatio(-0.1)).toBe(false);
  });
});

describe('F13.8.5A registry snapshot size', () => {
  it('publica um conjunto estável e não vazio', () => {
    expect(ANALYTICAL_CAPABILITY_REGISTRY.length).toBeGreaterThanOrEqual(15);
    expect(ANALYTICAL_CAPABILITY_REGISTRY.length).toBeLessThanOrEqual(40);
  });
});
