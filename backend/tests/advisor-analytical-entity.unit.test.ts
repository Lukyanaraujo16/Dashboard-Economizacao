import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { classifyAnalyticalOutcome } from '../src/modules/advisor/domain/classify-analytical-outcome.js';
import { loadAnalyticalCostCenterCatalog } from '../src/modules/advisor/domain/load-analytical-cost-center-catalog.js';
import {
  analyticalEntityFailureSignal,
  resolveAnalyticalEntitiesInText,
  resolveAnalyticalEntity,
  type AnalyticalEntityRecord,
} from '../src/modules/advisor/domain/resolve-analytical-entity.js';

function center(id: string, name: string, code: string | null = null): AnalyticalEntityRecord {
  return { id, dimension: 'COST_CENTER', name, code };
}

const UNITS = [
  center('cc-centro', 'Empresa ABC Unidade Centro'),
  center('cc-norte', 'Empresa ABC Unidade Norte'),
];

describe('resolução de entidades analíticas', () => {
  it('resolve o nome oficial exato dentro do catálogo do tenant', () => {
    const result = resolveAnalyticalEntity('Empresa ABC Unidade Centro', UNITS);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      match: 'EXACT',
      entity: { id: 'cc-centro', name: 'Empresa ABC Unidade Centro' },
    });
  });

  it('resolve ignorando caixa', () => {
    const result = resolveAnalyticalEntity('EMPRESA ABC UNIDADE NORTE', UNITS);
    expect(result).toMatchObject({ status: 'RESOLVED', match: 'EXACT', entity: { id: 'cc-norte' } });
  });

  it('resolve ignorando acento', () => {
    const catalog = [center('cc-acucar', 'Açúcar União')];
    const result = resolveAnalyticalEntity('acucar uniao', catalog);
    expect(result).toMatchObject({ status: 'RESOLVED', match: 'EXACT', entity: { id: 'cc-acucar' } });
  });

  it('reconhece o nome oficial dentro de uma menção maior', () => {
    const result = resolveAnalyticalEntity('resultado da Empresa ABC Unidade Norte no período', UNITS);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      match: 'OFFICIAL_NAME',
      entity: { id: 'cc-norte', name: 'Empresa ABC Unidade Norte' },
    });
  });

  it('resolve parte discriminante quando ela identifica um único nome oficial', () => {
    const result = resolveAnalyticalEntity('Norte', UNITS);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      match: 'DISCRIMINANT_TOKENS',
      entity: { id: 'cc-norte', name: 'Empresa ABC Unidade Norte' },
    });
  });

  it('resolve duas menções distintas na mesma pergunta', () => {
    const results = resolveAnalyticalEntitiesInText(
      'qual unidade ficou melhor, Centro ou Norte?',
      UNITS,
    );
    expect(results.map((item) => (item.status === 'RESOLVED' ? item.entity.id : item.status))).toEqual([
      'cc-centro',
      'cc-norte',
    ]);
  });

  it('devolve NOT_FOUND e preserva a menção inexistente', () => {
    const result = resolveAnalyticalEntity('setor inexistente', UNITS);
    expect(result).toEqual({ status: 'NOT_FOUND', mention: 'setor inexistente' });
    expect(analyticalEntityFailureSignal(result, 'COST_CENTER')).toEqual({
      reason: 'ENTITY_NOT_FOUND',
      dimension: 'COST_CENTER',
      entity: 'setor inexistente',
    });
  });

  it('devolve AMBIGUOUS quando a parte aparece em mais de um nome', () => {
    const catalog = [center('cc-alpha', 'Alpha Centro'), center('cc-beta', 'Beta Centro')];
    const result = resolveAnalyticalEntity('centro', catalog);
    expect(result.status).toBe('AMBIGUOUS');
    if (result.status !== 'AMBIGUOUS') {
      return;
    }
    expect(result.candidates.map((item) => item.id)).toEqual(['cc-alpha', 'cc-beta']);
    expect(JSON.stringify(result)).not.toContain('amount');
    const signal = analyticalEntityFailureSignal(result, 'COST_CENTER');
    expect(signal?.reason).toBe('ENTITY_AMBIGUOUS');
    expect(
      classifyAnalyticalOutcome({
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: false,
        factualClosed: false,
        factualPartial: false,
        structuredStatus: null,
        traces: [
          {
            status: 'AMBIGUOUS',
            reason: 'ENTITY_AMBIGUOUS',
            unresolvedDimension: signal?.dimension,
            unresolvedEntity: signal?.entity,
          },
        ],
      }),
    ).toBe('CLARIFICATION_REQUIRED');
  });

  it('não resolve centro inativo nem centro de outro tenant', async () => {
    const rows = {
      'tenant-a': [
        { id: 'a-centro', name: 'Empresa ABC Unidade Centro', code: null, active: true },
        { id: 'a-norte', name: 'Empresa ABC Unidade Norte', code: null, active: true },
        { id: 'a-inativo', name: 'Empresa ABC Unidade Sul', code: null, active: false },
      ],
      'tenant-b': [{ id: 'b-centro', name: 'Empresa ABC Unidade Centro', code: null, active: true }],
    };
    const seen: string[] = [];
    const catalog = await loadAnalyticalCostCenterCatalog('tenant-a', {
      async listByTenant(tenantId: string) {
        seen.push(tenantId);
        return rows[tenantId as 'tenant-a'] ?? [];
      },
    });
    expect(seen).toEqual(['tenant-a']);
    expect(catalog.map((item) => item.id)).toEqual(['a-centro', 'a-norte']);
    const resolved = resolveAnalyticalEntity('Sul', catalog);
    expect(resolved.status).toBe('NOT_FOUND');
    const foreign = resolveAnalyticalEntity('Empresa ABC Unidade Centro', catalog);
    expect(foreign.status).toBe('RESOLVED');
    if (foreign.status === 'RESOLVED') {
      expect(foreign.entity.id).toBe('a-centro');
    }
    expect(JSON.stringify(catalog)).not.toContain('b-centro');
  });

  it('liga ausência estruturada à trilha sem olhar prosa', () => {
    const result = resolveAnalyticalEntity('setor inexistente', UNITS);
    const signal = analyticalEntityFailureSignal(result, 'COST_CENTER');
    expect(
      classifyAnalyticalOutcome({
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: false,
        factualClosed: false,
        factualPartial: false,
        structuredStatus: null,
        traces: [
          {
            status: 'NOT_FOUND',
            reason: signal?.reason ?? 'UNKNOWN',
            unresolvedEntity: signal?.entity,
          },
        ],
      }),
    ).toBe('NO_DATA');
  });
});

describe('fixture de duas unidades com nome oficial maior', () => {
  const catalog = [
    center('cc-laranjeiras', 'Clínica Life Laranjeiras'),
    center('cc-jacaraipe', 'Clínica Life Jacaraípe'),
  ];

  it('associa cada parte discriminante ao centro oficial do mesmo catálogo', () => {
    const results = resolveAnalyticalEntitiesInText(
      'Qual das duas unidades, Laranjeiras ou Jacaraípe, teve melhor resultado?',
      catalog,
    );
    expect(results).toEqual([
      {
        status: 'RESOLVED',
        mention: 'laranjeira',
        match: 'DISCRIMINANT_TOKENS',
        entity: {
          id: 'cc-laranjeiras',
          dimension: 'COST_CENTER',
          name: 'Clínica Life Laranjeiras',
          code: null,
        },
      },
      {
        status: 'RESOLVED',
        mention: 'jacaraipe',
        match: 'DISCRIMINANT_TOKENS',
        entity: {
          id: 'cc-jacaraipe',
          dimension: 'COST_CENTER',
          name: 'Clínica Life Jacaraípe',
          code: null,
        },
      },
    ]);
  });
});

describe('nomes de fixture fora da produção', () => {
  it('não grava nomes do caso de homologação no resolvedor', () => {
    const sources = [
      '../src/modules/advisor/domain/resolve-analytical-entity.ts',
      '../src/modules/advisor/domain/load-analytical-cost-center-catalog.ts',
    ].map((relative) => readFileSync(new URL(relative, import.meta.url), 'utf8').toLowerCase());
    const joined = sources.join('\n');
    expect(joined).not.toContain('laranjeiras');
    expect(joined).not.toContain('jacaraipe');
    expect(joined).not.toContain('jacaraípe');
    expect(joined).not.toContain('clínica life');
    expect(joined).not.toContain('clinica life');
    expect(joined).not.toContain('felipe');
  });
});
