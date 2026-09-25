import { afterAll, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createCashRealizedDetailsService } from '../src/modules/analytics/services/cash-realized-details.service.js';
import {
  createAdvisorNominalDimensionService,
  resolveAdvisorOfficialCategory,
} from '../src/modules/advisor/index.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../src/modules/finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';

const CLINICA_LIFE_TENANT = '8b7e9b53-3435-476a-be47-56908ca846c5';

function looksPersonal(value: string): boolean {
  const folded = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (
    /\b(ltda|seguros|unimed|bradesco|vale|prev|amil|sulamerica|porto|hapvida)\b/.test(folded)
  ) {
    return false;
  }
  const tokens = folded.split(/\s+/).filter(Boolean);
  return tokens.length >= 2 && tokens.every((token) => /^[a-z]{2,}$/.test(token));
}

describe('F13.8.1D3 smoke read-only Clínica Life', () => {
  it('ranking/lookup/compare JUL e AGO em Atendimentos Convênio', async () => {
    const prisma = getPrismaClient();
    const tenant = await prisma.tenant.findUnique({
      where: { id: CLINICA_LIFE_TENANT },
      select: { id: true },
    });
    if (tenant === null) {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_d3_smoke_skipped',
          reason: 'tenant ausente no banco local',
        }),
      );
      return;
    }

    const categories = createFinancialCategoryReadRepository(prisma);
    const catalog = await categories.listByTenant(CLINICA_LIFE_TENANT);
    const resolved = resolveAdvisorOfficialCategory(
      'convenio',
      catalog.map((row) => ({ key: row.externalId, name: row.name, type: row.type })),
    );
    expect(resolved.status).toBe('RESOLVED');
    if (resolved.status !== 'RESOLVED') {
      return;
    }
    expect(resolved.category.name).toBe('Atendimentos Convênio');

    const nominal = createAdvisorNominalDimensionService({
      details: createCashRealizedDetailsService({
        ledger: createLedgerReadRepository(prisma),
        receivables: createReceivableReadRepository(prisma),
        payables: createPayableReadRepository(prisma),
        categories,
        parties: createPartyReadRepository(prisma),
        costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
      }),
      categories,
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    const [jul, ago, particulares, valeAgo, valeCompare] = await Promise.all([
      nominal.rank({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-07',
        categoryReference: 'convenio',
        limit: 5,
        now,
      }),
      nominal.rank({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        categoryReference: 'convenio',
        limit: 5,
        now,
      }),
      nominal.rank({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        categoryReference: 'Atendimentos Particulares',
        limit: 5,
        now,
      }),
      nominal.lookup({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        categoryReference: 'convenio',
        entityQuery: 'Vale',
        now,
      }),
      nominal.compare({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        categoryReference: 'convenio',
        entityQuery: 'Vale',
        now,
      }),
    ]);

    expect(jul.status).toBe('OK');
    expect(ago.status).toBe('OK');
    expect(jul.category).toMatchObject({ name: 'Atendimentos Convênio' });
    expect(ago.populationComplete).toBe(true);
    expect(particulares.category).toMatchObject({ name: 'Atendimentos Particulares' });
    expect(particulares.population).not.toEqual(ago.population);

    const agoRanking = ago.ranking as Array<{ displayName: string }>;
    expect(agoRanking.every((row) => !looksPersonal(row.displayName))).toBe(true);
    expect(JSON.stringify(ago)).not.toMatch(/cpf|cnpj|@|telefone/i);
    expect(valeAgo.status === 'OK' || valeAgo.status === 'NOT_FOUND').toBe(true);
    expect(valeCompare.status === 'OK' || valeCompare.status === 'NOT_FOUND' || valeCompare.status === 'AMBIGUOUS').toBe(
      true,
    );

    console.info(
      JSON.stringify({
        event: 'clinica_life_d3_smoke',
        jul: summarize(jul),
        ago: summarize(ago),
      }),
    );
  });
});

afterAll(async () => {
  await disconnectPrisma();
});

function summarize(payload: Record<string, unknown>): Record<string, unknown> {
  const coverage = payload.coverage as Record<string, unknown> | undefined;
  const ranking = (payload.ranking as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    population: payload.population,
    coverage,
    conclusionSafety: payload.conclusionSafety,
    ranking: ranking.map((row) => ({
      rank: row.rank,
      displayName: looksPersonal(String(row.displayName ?? '')) ? '[PERSON_REDACTED]' : row.displayName,
      amount: row.amount,
      movementCount: row.movementCount,
      shareOfIdentified: row.shareOfIdentified,
      shareOfPopulation: row.shareOfPopulation,
    })),
  };
}
