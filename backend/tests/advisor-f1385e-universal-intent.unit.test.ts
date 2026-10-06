import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { ANALYTICAL_CAPABILITY_REGISTRY } from '../src/modules/advisor/domain/analytical/analytical-capability-registry.js';
import { isAdvisorInterpretiveQuestion } from '../src/modules/advisor/domain/classify-advisor-factual-response.js';
import { resolveAdvisorCostCenterIntent } from '../src/modules/advisor/domain/resolve-advisor-cost-center-intent.js';
import { resolveAdvisorCurrentSnapshotIntent } from '../src/modules/advisor/domain/resolve-advisor-current-snapshot-intent.js';
import { resolveAdvisorConversationalNominal } from '../src/modules/advisor/domain/resolve-advisor-conversational-nominal.js';
import { resolveAdvisorDrilldownIntent } from '../src/modules/advisor/domain/resolve-advisor-drilldown-intent.js';
import { resolveAdvisorNominalIntent } from '../src/modules/advisor/domain/resolve-advisor-nominal-intent.js';
import {
  resolveCompanyCashDirection,
  resolveUniversalAnalyticalIntent,
  type UniversalAnalyticalIntent,
} from '../src/modules/advisor/domain/resolve-universal-analytical-intent.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  type SendAdvisorMessageDependencies,
} from '../src/modules/advisor/index.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';

const NOW = new Date('2026-09-30T15:00:00.000Z');

const CONVENIO_WINNER = 'Qual foi o convênio que mais gerou entrada de caixa em agosto de 2026?';
const COUNTERPARTY_WINNER = 'Qual contraparte mais gerou entrada de caixa em agosto de 2026?';
const WHO_WINNER = 'Quem mais gerou entrada de caixa em agosto de 2026?';
const CUSTOMER_WINNER = 'Qual cliente mais me pagou em 2025?';
const SUPPLIER_WINNER = 'Qual fornecedor recebeu mais em 2025?';
const CATEGORY_BREAKDOWN = 'Quais categorias tiveram as maiores entradas em agosto de 2026?';
const MOVEMENT_TOP5 = 'Quais foram os 5 maiores recebimentos de agosto de 2026?';
const COST_CENTER_WINNER = 'Qual centro de custo teve a maior saída em agosto de 2026?';

function resolved(content: string): Extract<UniversalAnalyticalIntent, { kind: 'RESOLVED' }> {
  const intent = resolveUniversalAnalyticalIntent({ content, now: NOW });
  expect(intent.kind).toBe('RESOLVED');
  if (intent.kind !== 'RESOLVED') {
    throw new Error('intenção não resolvida');
  }
  return intent;
}

function expectNoConvenio(intent: Extract<UniversalAnalyticalIntent, { kind: 'RESOLVED' }>): void {
  expect(intent.query.filters?.categoryReference).not.toBe('convenio');
  expect(JSON.stringify(intent.query)).not.toContain('convenio');
}

describe('F13.8.5E universal intent', () => {
  it('publica 31 capabilities, incluindo TOPN, lookup, share e planejamento', () => {
    expect(ANALYTICAL_CAPABILITY_REGISTRY).toHaveLength(34);
  });

  it('não injeta convênio sem evidência na pergunta', () => {
    const convenio = resolved(CONVENIO_WINNER);
    expect(convenio.query.filters?.categoryReference).toBe('convenio');
    expect(convenio.query.dimension).toBe('COUNTERPARTY');
    expect(convenio.query.direction).toBe('INFLOW');
    expect(convenio.query.operation).toBe('RANKING_WINNER');
    expect(convenio.validation.ok).toBe(true);

    for (const question of [COUNTERPARTY_WINNER, WHO_WINNER, CUSTOMER_WINNER, SUPPLIER_WINNER, CATEGORY_BREAKDOWN]) {
      expectNoConvenio(resolved(question));
    }
  });

  it('resolve direção pela perspectiva da empresa', () => {
    expect(resolveCompanyCashDirection('Quanto a empresa recebeu em agosto?')).toBe('INFLOW');
    expect(resolveCompanyCashDirection('Quanto recebemos em agosto?')).toBe('INFLOW');
    expect(resolveCompanyCashDirection('Quanto a empresa pagou em agosto?')).toBe('OUTFLOW');
    expect(resolveCompanyCashDirection('Quanto pagamos em agosto?')).toBe('OUTFLOW');
    expect(resolveCompanyCashDirection(SUPPLIER_WINNER)).toBe('OUTFLOW');
    expect(resolveCompanyCashDirection(CUSTOMER_WINNER)).toBe('INFLOW');
    expect(resolveCompanyCashDirection('Quanto o fornecedor Alfa recebeu da empresa?')).toBe('OUTFLOW');
    expect(resolveCompanyCashDirection('Quanto o cliente Alfa pagou para a empresa?')).toBe('INFLOW');
    expect(resolveCompanyCashDirection('O fornecedor me pagou em agosto.')).toBe('INFLOW');
  });

  it('resolve dimensão, operação e limite sem ordinal', () => {
    expect(resolved('Entradas por categoria em agosto de 2026').query).toMatchObject({
      dimension: 'CATEGORY',
      operation: 'BREAKDOWN',
      direction: 'INFLOW',
    });
    expect(resolved(COST_CENTER_WINNER).query).toMatchObject({
      dimension: 'COST_CENTER',
      direction: 'OUTFLOW',
      operation: 'RANKING_WINNER',
      period: { kind: 'MONTH', monthKey: '2026-08' },
    });
    expect(resolved(SUPPLIER_WINNER).query.filters?.partyProfile).toBe('SUPPLIER');
    expect(resolved(CUSTOMER_WINNER).query.filters?.partyProfile).toBe('CUSTOMER');
    expect(resolved(CONVENIO_WINNER).query.dimension).toBe('COUNTERPARTY');
    expect(resolved(MOVEMENT_TOP5).query).toMatchObject({
      operation: 'MOVEMENTS',
      direction: 'INFLOW',
      limit: 5,
    });
    expect(resolved(MOVEMENT_TOP5).query.dimension).toBeUndefined();

    expect(resolved('Quais os 3 maiores centros de custo de saída em agosto de 2026?').query).toMatchObject({
      dimension: 'COST_CENTER',
      operation: 'RANKING_TOPN',
      limit: 3,
      direction: 'OUTFLOW',
    });
    expect(resolved('Quanto o fornecedor Alfa recebeu da empresa em 2025?').query).toMatchObject({
      operation: 'LOOKUP',
      direction: 'OUTFLOW',
      identity: { kind: 'QUERY', query: 'Alfa' },
    });
    expect(resolved('5 maiores entradas de agosto de 2026').query).toMatchObject({
      operation: 'MOVEMENTS',
      direction: 'INFLOW',
      limit: 5,
    });
    expect(resolved('Compare julho de 2026 com agosto de 2026.').query).toMatchObject({
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      operation: 'COMPARE',
      period: { kind: 'COMPARISON' },
    });
    expect(resolveUniversalAnalyticalIntent({
      content: 'Quem foi o segundo colocado em agosto de 2026?',
      now: NOW,
    }).kind).toBe('UNSUPPORTED_ORDINAL');
    expect(resolveUniversalAnalyticalIntent({
      content: 'Qual produto mais vendido em agosto de 2026?',
      now: NOW,
    }).kind).toBe('UNRESOLVED');
  });

  it('entende fornecedor e nega sem publicar capability', () => {
    const intent = resolved(SUPPLIER_WINNER);
    expect(intent.query).toMatchObject({
      semanticFamily: 'FLOW',
      metric: 'REALIZED_CASH',
      direction: 'OUTFLOW',
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_WINNER',
      period: { kind: 'YEAR', year: 2025 },
      filters: { partyProfile: 'SUPPLIER' },
    });
    expect(intent.validation.ok).toBe(true);
    if (!intent.validation.ok) {
      throw new Error('capability de fornecedor deveria estar publicada');
    }
    expect(intent.validation.capability.key).toBe(
      'realized_cash.counterparty.outflow.supplier.ranking_winner',
    );
    expect(JSON.stringify(intent.query)).not.toContain('tenant');
  });

  it('entende cliente e nega sem reutilizar convênio', () => {
    const intent = resolved(CUSTOMER_WINNER);
    expect(intent.query).toMatchObject({
      direction: 'INFLOW',
      dimension: 'COUNTERPARTY',
      operation: 'RANKING_WINNER',
      period: { kind: 'YEAR', year: 2025 },
      filters: { partyProfile: 'CUSTOMER' },
    });
    expect(intent.validation.ok).toBe(true);
    expectNoConvenio(intent);
  });

  it('preserva convênio explícito, categoria, movimentos, centro de custo, comparação e snapshot', () => {
    expect(resolveAdvisorNominalIntent(CONVENIO_WINNER, { now: NOW })).toMatchObject({
      toolName: 'cash_nominal_dimension_ranking',
      categoryReference: 'convenio',
    });
    expect(resolved(CATEGORY_BREAKDOWN).query).toMatchObject({
      dimension: 'CATEGORY',
      operation: 'BREAKDOWN',
      direction: 'INFLOW',
      period: { kind: 'MONTH', monthKey: '2026-08' },
    });
    expect(resolveAdvisorDrilldownIntent(CATEGORY_BREAKDOWN)?.toolName).toBe('cash_realized_breakdown');
    expect(resolveAdvisorDrilldownIntent(MOVEMENT_TOP5)?.toolName).toBe('cash_movement_lines');
    expect(resolved(COST_CENTER_WINNER).validation.ok).toBe(true);
    expect(resolveAdvisorCostCenterIntent({
      content: COST_CENTER_WINNER,
      period: { source: 'EXPLICIT', comparison: false },
    })).toMatchObject({ direction: 'OUTFLOW' });
    expect(resolved('Compare julho de 2026 com agosto de 2026.').validation.ok).toBe(true);
    const snapshotQuestion = 'Quanto tenho a receber e quanto tenho a pagar hoje?';
    expect(resolveUniversalAnalyticalIntent({ content: snapshotQuestion, now: NOW }).kind).toBe('UNRESOLVED');
    expect(resolveAdvisorCurrentSnapshotIntent({
      content: 'Quanto tenho a receber hoje?',
      period: { source: 'CURRENT', comparison: false },
    })).toBe('SNAPSHOT_OPEN_RECEIVABLES');
    expect(isAdvisorInterpretiveQuestion('O que você acha das categorias de entrada de agosto de 2026?')).toBe(true);
  });

  it('não herda convênio quando a pergunta atual nomeia fornecedor', () => {
    const replaced = resolveAdvisorConversationalNominal({
      content: SUPPLIER_WINNER,
      priorUserContents: [CONVENIO_WINNER],
      now: NOW,
    });
    expect(replaced.intent).toBeNull();
    expect(replaced.anaphora).toBe('NONE');

    const inherited = resolveAdvisorConversationalNominal({
      content: 'E a Unimed?',
      priorUserContents: [CONVENIO_WINNER],
      now: NOW,
    });
    expect(inherited.intent).toMatchObject({
      entityQuery: 'Unimed',
      categoryReference: 'convenio',
    });
  });
});

describe('F13.8.5E capability denied no runtime', () => {
  it('não chama provider nem tool nominal para fornecedor, cliente, contraparte ou quem', async () => {
    for (const question of [SUPPLIER_WINNER, CUSTOMER_WINNER, COUNTERPARTY_WINNER, WHO_WINNER]) {
      const execute = vi.fn();
      const { send, openai } = createHarness({ analyticalTools: { execute } });
      const result = await send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question,
        now: NOW,
      });
      expect(execute).not.toHaveBeenCalled();
      expect(openai.lastInput).toBeNull();
      expect(result.run).toBeNull();
      expect(result.factualAnswer?.providerCalled).toBe(false);
      expect(result.factualAnswer?.intentKind).toBe('FACTUAL_LIMITATION');
      expect(result.consultantMessage.content.toLowerCase()).not.toContain('convenio');
      expect(result.consultantMessage.content.toLowerCase()).not.toContain('convênio');
      expect(result.consultantMessage.content).not.toContain('partyId');
      expect(result.consultantMessage.content).not.toContain('0,44');
      expect(result.consultantMessage.content).not.toContain('Conta Azul');
    }
  });

  it('continua executando o ranking quando a pergunta diz convênio', async () => {
    const execute = vi.fn(async () => ({
      ok: false,
      content: '{}',
      monthKey: '2026-08',
    }));
    const { send } = createHarness({ analyticalTools: { execute } });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: CONVENIO_WINNER,
      now: NOW,
    });
    expect(execute).toHaveBeenCalled();
    const call = execute.mock.calls[0]?.[0] as { call: { arguments: { categoryReference?: string } } };
    expect(call.call.arguments.categoryReference).toBe('convenio');
    expect(result.consultantMessage.content).not.toContain('Não consigo fechar');
  });

  it('pergunta interpretativa sobre categorias ainda chega ao provider', async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      content: JSON.stringify({ status: 'OK', items: [] }),
      monthKey: '2026-08',
    }));
    const { send, openai } = createHarness({ analyticalTools: { execute } });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'O que você acha das categorias de entrada de agosto de 2026?',
      now: NOW,
    });
    expect(result.consultantMessage.content).toBe('Leitura interpretativa.');
    expect(openai.lastInput).not.toBeNull();
    expect(result.consultantMessage.content).not.toContain('Não consigo fechar');
  });
});

function createHarness(options?: {
  readonly analyticalTools?: SendAdvisorMessageDependencies['analyticalTools'];
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'Leitura interpretativa.' });
  const anthropic = createFakeIaProvider({ id: 'ANTHROPIC' });
  const messages: AiMessageRecord[] = [];
  const conversationRows = [conversation()];
  let messageSeq = 0;
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant() {
        return settings();
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
        const now = new Date();
        return {
          id: 'run-1',
          tenantId,
          userId: input.userId ?? null,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          runType: input.runType ?? 'QUESTION_REPLY',
          provider: input.provider,
          model: input.model,
          status: input.status,
          inputTokens: null,
          outputTokens: null,
          durationMs: null,
          errorCode: null,
          createdAt: now,
          finishedAt: null,
        } satisfies AiRunRecord;
      },
      async updateRun(_tenantId, _runId, input) {
        return {
          id: 'run-1',
          tenantId: 'tenant-a',
          userId: 'user-a',
          conversationId: 'conv-a',
          messageId: null,
          runType: 'QUESTION_REPLY',
          provider: 'OPENAI',
          model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
          status: input.status,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          durationMs: input.durationMs ?? null,
          errorCode: input.errorCode ?? null,
          createdAt: new Date(),
          finishedAt: input.finishedAt ?? null,
        } satisfies AiRunRecord;
      },
    },
    context: {
      build: vi.fn(async () => builtContext()),
      withDocumentKnowledge: vi.fn(async (built: AdvisorBuiltContext) => built),
    },
    providers: createIaProviderRegistry({ openai, anthropic }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    analyticalTools: options?.analyticalTools,
  });
  return { send, openai };
}

function settings(): AiTenantSettingsRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: 'set-a',
    tenantId: 'tenant-a',
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

function conversation(): AiConversationRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: 'conv-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    status: 'OPEN',
    title: 'já definida',
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
  tenantId: string,
  conversationId: string,
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
    blocks: [],
  };
}
