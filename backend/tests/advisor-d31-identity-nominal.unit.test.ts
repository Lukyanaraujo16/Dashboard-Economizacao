import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  ADVISOR_PLATFORM_INSTRUCTIONS,
  AI_PROVIDER_MODEL_CATALOG,
  aggregateAdvisorNominalDimension,
  compareAdvisorNominalAggregations,
  createSendAdvisorMessage,
  identifyAdvisorNominalDimension,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  readAdvisorNominalRankingWinner,
  resolveAdvisorConversationalNominal,
  serializeAdvisorNominalRanking,
  type BuildAdvisorContextInput,
  type SendAdvisorMessageDependencies,
} from '../src/modules/advisor/index.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function details(items: CashRealizedDetails['items']): CashRealizedDetails {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    today: new Date('2026-09-24T00:00:00.000Z'),
    direction: 'inflows',
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    available: true,
    total: items.reduce((sum, item) => sum.plus(item.attributedAmount), dec('0')),
    itemCount: items.length,
    limit: items.length,
    offset: 0,
    items,
  };
}

function item(input: {
  readonly id: string;
  readonly amount: string;
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly partyName?: string | null;
}): CashRealizedDetails['items'][number] {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.id,
    installmentKind: 'RECEIVABLE',
    occurredOn: new Date('2026-08-10T00:00:00.000Z'),
    netAmount: dec(input.amount),
    attributedAmount: dec(input.amount),
    description: input.description ?? null,
    partyId: input.partyId ?? null,
    partyName: input.partyName ?? null,
    categoryNames: ['Atendimentos Convênio'],
    categoryExternalIds: ['cat-conv'],
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    categoryName: 'Atendimentos Convênio',
  };
}

function namedGroups(count: number, amount: string): CashRealizedDetails['items'] {
  return Array.from({ length: count }, (_, index) =>
    item({
      id: `e-${index + 1}`,
      amount,
      description: `Entidade ${String.fromCharCode(65 + index)}`,
    }),
  );
}

function listAdvisorSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listAdvisorSourceFiles(full));
      continue;
    }
    if (full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('F13.8.1D3.1 continuidade conversacional', () => {
  it('ranking inequívoco + "desse convênio" pede o vencedor factual', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'Quanto eu recebi desse convênio no mês?',
      priorUserContents: ['Qual convênio individual mais faturou em agosto de 2026?'],
    });
    expect(resolved.anaphora).toBe('NEEDS_RANKING_WINNER');
    expect(resolved.needsRankingWinner).toBe(true);
    expect(resolved.rankingQuestion).toContain('mais faturou');
  });

  it('lookup explícito + "E em julho?" preserva a entidade', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'E em julho?',
      priorUserContents: ['Quanto recebi da Vale em agosto?'],
    });
    expect(resolved.anaphora).toBe('RESOLVED');
    expect(resolved.intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      entityQuery: 'Vale',
    });
  });

  it('"Compare Vale e Bradesco" + "dele" é AMBIGUOUS', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'Quanto recebi dele?',
      priorUserContents: ['Compare Vale e Bradesco.'],
    });
    expect(resolved.anaphora).toBe('AMBIGUOUS');
    expect(resolved.intent).toBeNull();
  });

  it('nova conversa não herda entidade', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'Quanto eu recebi desse convênio no mês?',
      priorUserContents: [],
    });
    expect(resolved.anaphora).toBe('UNRESOLVED');
    expect(resolved.intent).toBeNull();
  });

  it('antecedente UNKNOWN não resolve entidade nominal', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'Quanto recebi desse parceiro?',
      priorUserContents: ['Como está o faturamento?'],
    });
    expect(resolved.anaphora).toBe('UNRESOLVED');
  });

  it('antecedente AMBIGUOUS não escolhe silenciosamente', () => {
    const resolved = resolveAdvisorConversationalNominal({
      content: 'Quanto recebi dessa empresa?',
      priorUserContents: ['Compare Vale e Bradesco'],
    });
    expect(resolved.anaphora).toBe('AMBIGUOUS');
  });
});

describe('F13.8.1D3.1 identidade e cobertura', () => {
  it('IDENTIFIED entra no ranking; UNKNOWN e AMBIGUOUS não viram empresa', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '80', partyId: 'p-a', partyName: 'Entidade A', description: 'A' }),
        item({ id: '2', amount: '20', description: 'Recebimento convênio' }),
        item({
          id: '3',
          amount: '15',
          partyId: 'p-b',
          partyName: 'Entidade B',
          description: 'Entidade B',
        }),
        item({ id: '4', amount: '10', description: 'Entidade B' }),
      ]),
    });
    expect(aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED')).toHaveLength(2);
    expect(aggregation.coverage.unknownAmount.toString()).toBe('20');
    expect(aggregation.coverage.ambiguousAmount.toString()).toBe('10');
    const ranked = rankAdvisorNominalDimension(aggregation, 5);
    expect(ranked.ranking).toHaveLength(2);
    expect(ranked.ranking[0]?.identityStatus).toBe('IDENTIFIED');
    expect(ranked.ranking[0]?.displayName).toBe('Entidade A');
    expect(ranked.ranking.every((row) => row.identityStatus === 'IDENTIFIED')).toBe(true);
    expect(ranked.ranking.map((row) => row.displayName)).not.toContain('Recebimento convênio');
    expect(identifyAdvisorNominalDimension({
      partyId: null,
      partyName: null,
      description: 'Recebimento convênio',
    }).status).toBe('UNKNOWN');
    expect(identifyAdvisorNominalDimension({
      partyId: null,
      partyName: null,
      description: 'Recebimento convênio',
    }).displayName).toBeNull();
  });

  it('displayName oficial não é inventado nem recebe sufixo', () => {
    const identity = identifyAdvisorNominalDimension({
      partyId: 'p-1',
      partyName: 'Entidade Oficial',
      description: 'texto operacional',
    });
    expect(identity.displayName).toBe('Entidade Oficial');
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '31.58', partyId: 'p-u', partyName: 'Entidade Oficial', description: 'var A' }),
        item({ id: '2', amount: '21.28', description: 'Entidade Oficial' }),
      ]),
    });
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(JSON.stringify(serialized)).not.toContain('outro movimento');
    expect(serialized.ranking).toEqual([
      expect.objectContaining({
        displayName: 'Entidade Oficial',
        identityStatus: 'IDENTIFIED',
      }),
    ]);
  });

  it('grupos textualmente parecidos não se unem sem evidência', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '31.57884', description: 'Unimed' }),
        item({ id: '2', amount: '21.28518', description: 'Unimed Fesp' }),
      ]),
    });
    expect(aggregation.groups).toHaveLength(2);
    expect(aggregation.groups.map((group) => group.normalizedKey).sort()).toEqual([
      'unimed',
      'unimed fesp',
    ]);
    expect(aggregation.groups.every((group) => group.identityStatus === 'IDENTIFIED')).toBe(true);
  });

  it('identificador estruturado comum une movimentos', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '10.11', partyId: 'p-same', partyName: 'Entidade X', description: 'var 1' }),
        item({ id: '2', amount: '20.22', partyId: 'p-same', partyName: 'Entidade X', description: 'var 2' }),
      ]),
    });
    expect(aggregation.groups).toHaveLength(1);
    expect(aggregation.groups[0]?.amount.toString()).toBe('30.33');
    expect(aggregation.groups[0]?.movementCount).toBe(2);
    expect(aggregation.groups[0]?.identityStatus).toBe('IDENTIFIED');
  });

  it('regra textual genérica une sufixo operacional e recusa nomes distintos', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '40', description: 'VALE' }),
        item({ id: '2', amount: '10', description: 'VALE - Bruto' }),
        item({ id: '3', amount: '5', description: 'Vale Transportes' }),
      ]),
    });
    expect(aggregation.groups.find((group) => group.normalizedKey === 'vale')?.amount.toString()).toBe('50');
    expect(aggregation.groups.find((group) => group.normalizedKey === 'vale transportes')).toBeDefined();
  });

  it('description que colide com party estruturada no mesmo key vira AMBIGUOUS sem unir', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({
          id: '1',
          amount: '31578.84',
          partyId: 'p-u',
          partyName: 'Unimed',
          description: 'Unimed Fesp',
        }),
        item({ id: '2', amount: '21285.18', description: 'Unimed' }),
      ]),
    });
    const identified = aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED');
    const ambiguous = aggregation.groups.filter((group) => group.identityStatus === 'AMBIGUOUS');
    expect(identified).toHaveLength(1);
    expect(identified[0]?.amount.toString()).toBe('31578.84');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]?.amount.toString()).toBe('21285.18');
    expect(aggregation.coverage.ambiguousAmount.toString()).toBe('21285.18');
    expect(rankAdvisorNominalDimension(aggregation, 5).ranking).toHaveLength(1);
    expect(lookupAdvisorNominalEntity(aggregation, 'Unimed').status).toBe('OK');
    expect(lookupAdvisorNominalEntity(aggregation, 'Unimed').matches[0]?.identityStatus).toBe(
      'IDENTIFIED',
    );
  });

  it('nenhuma regra contém nomes específicos de Clínica Life', () => {
    const files = listAdvisorSourceFiles(
      join(dirname(fileURLToPath(import.meta.url)), '../src/modules/advisor'),
    );
    const joined = files
      .filter((file) => !file.includes('platform-instructions'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(joined).not.toMatch(/UNIMED_ALIASES|CLINICA_LIFE_ALIASES|if\s*\(.*unimed/i);
    expect(joined).not.toMatch(/8b7e9b53-3435-476a-be47-56908ca846c5/);
    expect(joined).not.toMatch(/Clínica Life|Clinica Life/);
  });
});

describe('F13.8.1D3.1 coverage versus topN', () => {
  it('coverage 100% com 10 entidades e top5: top5Share < 100%', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details(namedGroups(10, '10.00')),
    });
    expect(aggregation.coverage.identifiedPercent?.toString()).toBe('100');
    expect(aggregation.conclusionSafety).toBe('COMPLETE');
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(serialized.identifiedEntityCount).toBe(10);
    expect(serialized.coverage).toEqual(
      expect.objectContaining({ identifiedPercent: '100' }),
    );
    expect(serialized.topN).toEqual(
      expect.objectContaining({
        returnedCount: 5,
        amount: '50',
        shareOfIdentified: '50',
        shareOfPopulation: '50',
        hasMore: true,
      }),
    );
    expect(serialized.coverageIsNotTopNShare).toBe(true);
    expect(serialized.hasMore).toBe(true);
    expect(serialized.returnedCount).toBe(5);
  });

  it('coverage 80% + top5: shareOfIdentified ≠ shareOfPopulation', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        ...namedGroups(5, '16.00'),
        item({ id: 'u1', amount: '20.00', description: 'Recebimento convênio' }),
      ]),
    });
    expect(aggregation.coverage.identifiedAmount.toString()).toBe('80');
    expect(aggregation.coverage.unknownAmount.toString()).toBe('20');
    expect(aggregation.coverage.identifiedPercent?.toString()).toBe('80');
    const ranked = rankAdvisorNominalDimension(aggregation, 5);
    expect(ranked.ranking[0]?.shareOfIdentified?.toString()).toBe('20');
    expect(ranked.ranking[0]?.shareOfPopulation?.toString()).toBe('16');
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: ranked,
    });
    expect(serialized.topN).toEqual(
      expect.objectContaining({
        shareOfIdentified: '100',
        shareOfPopulation: '80',
      }),
    );
  });

  it('UNKNOWN, AMBIGUOUS, cardinalidade, returnedCount, hasMore, topN e denominador zero', () => {
    const empty = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation: aggregateAdvisorNominalDimension({
        monthKey: '2026-08',
        categoryKey: 'cat-conv',
        categoryName: 'Atendimentos Convênio',
        details: details([]),
      }),
      ranking: rankAdvisorNominalDimension(
        aggregateAdvisorNominalDimension({
          monthKey: '2026-08',
          categoryKey: 'cat-conv',
          categoryName: 'Atendimentos Convênio',
          details: details([]),
        }),
        5,
      ),
    });
    expect(empty.topN).toEqual(
      expect.objectContaining({
        amount: '0',
        shareOfIdentified: 'NOT_APPLICABLE',
        shareOfPopulation: 'NOT_APPLICABLE',
      }),
    );
    expect(empty.winner).toBeNull();

    const mixed = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '44.60402', description: 'VALE' }),
        item({ id: '2', amount: '32.87986', description: 'VALE' }),
        item({ id: '3', amount: '10.00', partyId: 'p-b', partyName: 'Entidade B' }),
        item({ id: '4', amount: '5.00', description: 'Recebimento convênio' }),
        item({ id: '5', amount: '7.11', partyId: 'p-c', partyName: 'Entidade C' }),
        item({ id: '6', amount: '3.00', description: 'Entidade C' }),
      ]),
    });
    expect(mixed.coverage.unknownAmount.toString()).toBe('5');
    expect(mixed.coverage.ambiguousAmount.toString()).toBe('3');
    expect(mixed.groups.filter((group) => group.identityStatus === 'IDENTIFIED')).toHaveLength(3);
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation: mixed,
      ranking: rankAdvisorNominalDimension(mixed, 1),
    });
    expect(serialized.identifiedEntityCount).toBe(3);
    expect(serialized.ambiguousEntityCount).toBe(1);
    expect(serialized.unknownMovementCount).toBe(1);
    expect(serialized.returnedCount).toBe(1);
    expect(serialized.hasMore).toBe(true);
    expect(serialized.topN).toEqual(
      expect.objectContaining({
        returnedCount: 1,
        amount: '77.48388',
        hasMore: true,
      }),
    );
    expect(serialized.winner).toEqual(
      expect.objectContaining({
        displayName: 'VALE',
        identityStatus: 'IDENTIFIED',
      }),
    );
    expect(readAdvisorNominalRankingWinner(serialized)).toEqual({
      displayName: 'VALE',
      normalizedKey: 'vale',
    });
  });

  it('comparação preserva delta sem hardcode', () => {
    const jul = aggregateAdvisorNominalDimension({
      monthKey: '2026-07',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([item({ id: '1', amount: '44604.02', description: 'VALE' })]),
    });
    const ago = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([item({ id: '2', amount: '77483.88', description: 'VALE' })]),
    });
    const compared = compareAdvisorNominalAggregations({
      periodA: jul,
      periodB: ago,
      entityQuery: 'vale',
    });
    expect(compared.items[0]?.amountA.toString()).toBe('44604.02');
    expect(compared.items[0]?.amountB.toString()).toBe('77483.88');
    expect(compared.items[0]?.deltaAmount.toString()).toBe('32879.86');
    expect(compared.items[0]?.deltaPercent?.toDecimalPlaces(2).toString()).toBe('73.72');
  });
});

describe('F13.8.1D3.1 disciplina do provider', () => {
  it('PLATFORM proíbe sufixo inventado, cardinalidade falsa e estratégia espontânea', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('outro movimento');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('identifiedEntityCount');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO diga "N convênios"');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('coverage=100% não implica');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('identityStatus=IDENTIFIED');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('UNKNOWN/AMBIGUOUS não viram empresa');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('estratégias de relacionamento');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('melhor desempenho');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('convênio mais rentável');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('responda os fatos e pare');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('desse convênio');
  });
});

describe('F13.8.1D3.1 send-advisor-message anáfora', () => {
  function settings(tenantId = 'tenant-a'): AiTenantSettingsRecord {
    const now = new Date('2026-09-24T12:00:00.000Z');
    return {
      id: `set-${tenantId}`,
      tenantId,
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      businessSegment: 'Clínica',
      businessDescription: 'Clínica A',
      consultantName: null,
      adminPrompt: null,
      tonePreset: 'PROFISSIONAL_OBJETIVO',
      tone: 'objetivo',
      emojiPreference: 'MODERATE',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
  }

  function conversation(
    tenantId = 'tenant-a',
    userId = 'user-a',
    id = 'conv-a',
  ): AiConversationRecord {
    const now = new Date('2026-09-24T12:00:00.000Z');
    return {
      id,
      tenantId,
      userId,
      status: 'OPEN',
      title: 't',
      startedAt: now,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  function message(
    id: string,
    senderType: AiMessageRecord['senderType'],
    content: string,
    tenantId = 'tenant-a',
    conversationId = 'conv-a',
  ): AiMessageRecord {
    return {
      id,
      conversationId,
      tenantId,
      senderType,
      content,
      messageType: 'TEXT',
      createdAt: new Date('2026-09-24T12:00:00.000Z'),
    };
  }

  function builtContext(): AdvisorBuiltContext {
    return {
      tenantId: 'tenant-a',
      monthKey: '2026-08',
      blocks: [
        { type: 'PLATFORM_INSTRUCTIONS', content: 'plataforma', trustLevel: 'PLATFORM' },
        { type: 'USER_QUESTION', content: 'q', trustLevel: 'UNTRUSTED' },
      ],
    };
  }

  function createHarness(options?: {
    readonly extraConversations?: readonly AiConversationRecord[];
    readonly extraSettings?: readonly AiTenantSettingsRecord[];
    readonly analyticalTools?: SendAdvisorMessageDependencies['analyticalTools'];
    readonly context?: { build: (input: BuildAdvisorContextInput) => Promise<AdvisorBuiltContext> };
  }) {
    const openai = createFakeIaProvider({ id: 'OPENAI', text: 'fato' });
    const messages: AiMessageRecord[] = [];
    const runs: AiRunRecord[] = [];
    let messageSeq = 0;
    let runSeq = 0;
    const conversationRows = [conversation(), ...(options?.extraConversations ?? [])];
    const send = createSendAdvisorMessage({
      settings: {
        async findSettingsByTenant(tenantId) {
          const extra = options?.extraSettings?.find((row) => row.tenantId === tenantId);
          if (extra !== undefined) {
            return extra;
          }
          return tenantId === 'tenant-a' ? settings() : null;
        },
      },
      conversations: {
        async findConversation(tenantId, userId, conversationId) {
          return (
            conversationRows.find(
              (row) => row.tenantId === tenantId && row.userId === userId && row.id === conversationId,
            ) ?? null
          );
        },
        async createMessage(tenantId, conversationId, input) {
          const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
          messages.push(created);
          return created;
        },
        async updateConversationTitle() {
          return conversationRows[0] ?? null;
        },
        async listMessages(tenantId, conversationId) {
          return messages.filter(
            (item) => item.tenantId === tenantId && item.conversationId === conversationId,
          );
        },
      },
      runs: {
        async createRun(tenantId, input) {
          const created: AiRunRecord = {
            id: `run-${++runSeq}`,
            tenantId,
            userId: input.userId ?? null,
            conversationId: input.conversationId ?? null,
            messageId: input.messageId ?? null,
            runType: input.runType ?? 'QUESTION_REPLY',
            provider: input.provider,
            model: input.model,
            status: input.status,
            inputTokens: input.inputTokens ?? null,
            outputTokens: input.outputTokens ?? null,
            durationMs: input.durationMs ?? null,
            errorCode: input.errorCode ?? null,
            createdAt: new Date(),
            finishedAt: input.finishedAt ?? null,
          };
          runs.push(created);
          return created;
        },
        async updateRun(tenantId, runId, input: UpdateAiRunInput) {
          const index = runs.findIndex((row) => row.id === runId && row.tenantId === tenantId);
          const current = runs[index]!;
          const next = {
            ...current,
            status: input.status,
            messageId: input.messageId === undefined ? current.messageId : input.messageId,
            finishedAt: input.finishedAt === undefined ? current.finishedAt : input.finishedAt,
          };
          runs[index] = next;
          return next;
        },
      },
      context: options?.context ?? { build: vi.fn(async () => builtContext()) },
      providers: createIaProviderRegistry({
        openai,
        anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
      }),
      rateLimiter: createAllowAllConsultantRateLimiter(),
      analyticalTools: options?.analyticalTools,
    });
    return { send, messages, openai };
  }

  it('reexecuta ranking factual e faz lookup do vencedor IDENTIFIED', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const execute = vi.fn(async (input: {
      call: { id: string; name: string; arguments: Record<string, unknown> };
    }) => {
      if (input.call.name === 'cash_nominal_dimension_ranking') {
        return {
          id: input.call.id,
          name: input.call.name,
          ok: true,
          monthKey: '2026-08',
          content: JSON.stringify({
            winner: { displayName: 'VALE', normalizedKey: 'vale', identityStatus: 'IDENTIFIED' },
          }),
        };
      }
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        monthKey: '2026-08',
        content: JSON.stringify({
          status: 'OK',
          entity: { displayName: 'VALE', identityStatus: 'IDENTIFIED', amount: '77483.88' },
        }),
      };
    });
    const { send, messages } = createHarness({
      context: { build: contextBuild },
      analyticalTools: {
        tools: [{ name: 'cash_nominal_dimension_lookup', description: 'lk', inputSchema: {} }],
        execute,
      },
    });
    messages.push(
      message('seed-rank', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'),
      message('seed-asst', 'CONSULTANT', 'VALE - inventado (outro movimento)'),
    );
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto eu recebi desse convênio no mês?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          name: 'cash_nominal_dimension_ranking',
        }),
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          name: 'cash_nominal_dimension_lookup',
          arguments: expect.objectContaining({ entityQuery: 'VALE', monthKey: '2026-08' }),
        }),
      }),
    );
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthKey: '2026-08',
        drilldown: expect.objectContaining({
          toolName: 'cash_nominal_dimension_lookup',
          ok: true,
        }),
      }),
    );
  });

  it('preserva Vale no follow-up temporal', async () => {
    const execute = vi.fn(async (input: {
      call: { name: string; arguments: Record<string, unknown> };
    }) => ({
      id: 'preload-nominal',
      name: input.call.name,
      ok: true,
      monthKey: String(input.call.arguments.monthKey),
      content: JSON.stringify({ status: 'OK', entityQuery: input.call.arguments.entityQuery }),
    }));
    const { send, messages } = createHarness({
      analyticalTools: {
        tools: [{ name: 'cash_nominal_dimension_lookup', description: 'lk', inputSchema: {} }],
        execute,
      },
    });
    messages.push(message('seed-vale', 'USER', 'Quanto recebi da Vale em agosto?'));
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em julho?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          name: 'cash_nominal_dimension_lookup',
          arguments: expect.objectContaining({ entityQuery: 'Vale', monthKey: '2026-07' }),
        }),
      }),
    );
  });

  it('declara ambiguidade com múltiplos antecedentes', async () => {
    const contextBuild = vi.fn(async () => builtContext());
    const { send, messages } = createHarness({
      context: { build: contextBuild },
      analyticalTools: {
        tools: [],
        execute: vi.fn(async () => {
          throw new Error('não deveria executar lookup');
        }),
      },
    });
    messages.push(message('seed-cmp', 'USER', 'Compare Vale e Bradesco.'));
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto recebi dele?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        drilldown: expect.objectContaining({
          content: expect.stringContaining('MULTIPLE_NOMINAL_ANTECEDENTS'),
        }),
      }),
    );
  });

  it('não herda entidade entre conversas', async () => {
    const contextBuild = vi.fn(async () => builtContext());
    const { send, messages } = createHarness({
      extraConversations: [conversation('tenant-a', 'user-a', 'conv-b')],
      context: { build: contextBuild },
      analyticalTools: {
        tools: [],
        execute: vi.fn(async () => {
          throw new Error('não');
        }),
      },
    });
    messages.push(
      message('seed-a', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?', 'tenant-a', 'conv-a'),
    );
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-b',
      question: 'Quanto eu recebi desse convênio no mês?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        drilldown: expect.objectContaining({
          content: expect.stringContaining('NO_UNEQUIVOCAL_NOMINAL_ANTECEDENT'),
        }),
      }),
    );
  });

  it('não herda entidade entre tenants', async () => {
    const contextBuild = vi.fn(async () => builtContext());
    const { send, messages } = createHarness({
      extraConversations: [conversation('tenant-b', 'user-b', 'conv-b')],
      extraSettings: [settings('tenant-b')],
      context: { build: contextBuild },
      analyticalTools: {
        tools: [],
        execute: vi.fn(async () => {
          throw new Error('não');
        }),
      },
    });
    messages.push(
      message('seed-a', 'USER', 'Quanto recebi da Vale em agosto?', 'tenant-a', 'conv-a'),
    );
    await send.execute({
      tenantId: 'tenant-b',
      userId: 'user-b',
      conversationId: 'conv-b',
      question: 'Quanto eu recebi desse convênio no mês?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        drilldown: expect.objectContaining({
          content: expect.stringContaining('NO_UNEQUIVOCAL_NOMINAL_ANTECEDENT'),
        }),
      }),
    );
  });

  it('ranking sem vencedor IDENTIFIED não resolve anáfora', async () => {
    const contextBuild = vi.fn(async () => builtContext());
    const { send, messages } = createHarness({
      context: { build: contextBuild },
      analyticalTools: {
        tools: [],
        execute: vi.fn(async (input) => ({
          id: input.call.id,
          name: input.call.name,
          ok: true,
          content: JSON.stringify({ winner: null, ranking: [] }),
        })),
      },
    });
    messages.push(message('seed-rank', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'));
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto eu recebi desse convênio no mês?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        drilldown: expect.objectContaining({
          content: expect.stringContaining('NO_UNEQUIVOCAL_NOMINAL_ANTECEDENT'),
        }),
      }),
    );
  });
});
