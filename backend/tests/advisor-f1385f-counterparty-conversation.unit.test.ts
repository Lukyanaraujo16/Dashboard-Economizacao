import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
} from '../src/modules/advisor/index.js';
import { assessCounterpartyOperation } from '../src/modules/advisor/domain/counterparty-identity-quality.js';
import type { CounterpartyMovementInput } from '../src/modules/advisor/domain/counterparty-identity-quality.js';
import type { AnalyticalQuery } from '../src/modules/advisor/domain/analytical/analytical-query.js';
import { parseAnalyticalConversationState } from '../src/modules/advisor/domain/analytical-conversation-state.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const MONTH: AnalyticalQuery['period'] = { kind: 'MONTH', monthKey: '2026-08' };

function movement(
  partial: Partial<CounterpartyMovementInput> & Pick<CounterpartyMovementInput, 'amount'>,
): CounterpartyMovementInput {
  return {
    sameScope: true,
    partyId: 'p1',
    displayName: 'Alfa',
    profiles: ['CUSTOMER'],
    origin: 'RECEIVABLE',
    ...partial,
  };
}

function customerQuery(operation: AnalyticalQuery['operation'], identity?: string): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'INFLOW',
    period: MONTH,
    dimension: 'COUNTERPARTY',
    operation,
    filters: { partyProfile: 'CUSTOMER' },
    ...(operation === 'RANKING_TOPN' ? { limit: 2 } : {}),
    ...(identity !== undefined ? { identity: { kind: 'QUERY', query: identity } } : {}),
  };
}

describe('F13.8.5F operações de contraparte', () => {
  const population = [
    movement({ amount: '70', partyId: 'a', displayName: 'Alfa' }),
    movement({ amount: '20', partyId: 'b', displayName: 'Beta' }),
    movement({ amount: '10', partyId: null, sameScope: false, displayName: null, profiles: [], origin: 'MISSING' }),
  ];

  it('TOPN dos identificados permanece parcial quando há valor sem identidade ou período desconhecido', () => {
    const partial = assessCounterpartyOperation({
      movements: population,
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'UNKNOWN',
      query: customerQuery('RANKING_TOPN'),
    });
    expect(partial.decision).toBe('PARTIAL');
    expect(partial.rows.map((row) => row.displayName)).toEqual(['Alfa', 'Beta']);
    expect(partial.answer).toContain('Nos dados disponíveis');
    expect(partial.answer).toContain('não fecha o ranking absoluto');
    expect(partial.quality.periodCoverage).toBe('UNKNOWN');

    const completeGap = assessCounterpartyOperation({
      movements: population,
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('RANKING_TOPN'),
    });
    expect(completeGap.decision).toBe('PARTIAL');
    expect(completeGap.reasonCode).toBe('IDENTITY_INCOMPLETE');
  });

  it('TOPN completo, lookup, share e isolamento', () => {
    const clean = [
      movement({ amount: '80', partyId: 'a', displayName: 'Alfa' }),
      movement({ amount: '20', partyId: 'b', displayName: 'Beta' }),
    ];
    const top = assessCounterpartyOperation({
      movements: clean,
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('RANKING_TOPN'),
    });
    expect(top.decision).toBe('AVAILABLE');

    const lookup = assessCounterpartyOperation({
      movements: [
        ...clean,
        movement({ amount: '15', partyId: 'a', displayName: 'Alfa' }),
      ],
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('LOOKUP', 'alfa'),
    });
    expect(lookup.decision).toBe('AVAILABLE');
    expect(lookup.focusDisplayName).toBe('Alfa');
    expect(lookup.rows[0]?.amount).toBe('95.0000');

    const share = assessCounterpartyOperation({
      movements: clean,
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('SHARE', 'Alfa'),
    });
    expect(share.answer).toContain('80,00%');
    expect(share.answer).toContain('entradas observadas');

    const unknownShare = assessCounterpartyOperation({
      movements: clean,
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'UNKNOWN',
      query: customerQuery('SHARE', 'Alfa'),
    });
    expect(unknownShare.decision).toBe('PARTIAL');
    expect(unknownShare.answer).toContain('Nos dados disponíveis');
    expect(unknownShare.answer).not.toContain('cobertura integral');
    expect(unknownShare.quality.periodCoverage).toBe('UNKNOWN');

    const ambiguous = assessCounterpartyOperation({
      movements: [
        movement({ amount: '10', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '12', partyId: 'c', displayName: 'alfa' }),
      ],
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('LOOKUP', 'Alfa'),
    });
    expect(ambiguous.reasonCode).toBe('IDENTITY_AMBIGUOUS');

    const foreign = assessCounterpartyOperation({
      movements: [
        movement({ amount: '100', partyId: 'x', displayName: 'Outra', sameScope: false }),
        movement({ amount: '5', partyId: 'a', displayName: 'Alfa' }),
      ],
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('LOOKUP', 'Outra'),
    });
    expect(foreign.reasonCode).toBe('IDENTITY_NOT_FOUND');

    const tied = assessCounterpartyOperation({
      movements: [
        movement({ amount: '10', partyId: 'a', displayName: 'Beta' }),
        movement({ amount: '10', partyId: 'b', displayName: 'Alfa' }),
        movement({ amount: '10', partyId: 'c', displayName: 'Gama' }),
      ],
      partyProfile: 'CUSTOMER',
      direction: 'INFLOW',
      period: MONTH,
      periodCoverage: 'COMPLETE',
      query: customerQuery('RANKING_TOPN'),
    });
    expect(tied.rows.map((row) => row.displayName)).toEqual(['Alfa', 'Beta']);
    expect(tied.reasonCode).toBe('TOPN_BOUNDARY_TIE');
  });
});

describe('F13.8.5F conversa estruturada', () => {
  it('encadeia topn, ordinal, lookup, share, período e troca de perfil sem provider', async () => {
    const execute = vi.fn();
    const harness = createHarness({
      analyticalTools: { execute },
      counterpartyIdentity: {
        async load(input) {
          if (input.direction === 'OUTFLOW') {
            return [
              movement({
                amount: '90',
                partyId: 's1',
                displayName: 'Oficina',
                profiles: ['SUPPLIER'],
                origin: 'PAYABLE',
              }),
              movement({
                amount: '15',
                partyId: 's2',
                displayName: 'Papel',
                profiles: ['SUPPLIER'],
                origin: 'PAYABLE',
              }),
            ];
          }
          if (input.period.kind === 'MONTH' && input.period.monthKey === '2026-07') {
            return [movement({ amount: '30', partyId: 'n', displayName: 'Nilo' })];
          }
          return [
            movement({ amount: '70', partyId: 'a', displayName: 'Alfa' }),
            movement({ amount: '40', partyId: 'b', displayName: 'Beta' }),
            movement({
              amount: '5',
              partyId: null,
              sameScope: false,
              displayName: null,
              profiles: [],
              origin: 'MISSING',
            }),
          ];
        },
      },
    });
    const ask = (question: string, conversationId = 'conv-a', tenantId = 'tenant-a') =>
      harness.send.execute({
        tenantId,
        userId: 'user-a',
        conversationId,
        question,
        now: NOW,
      });

    const top = await ask('Quais foram os clientes que mais me pagaram em agosto de 2026?');
    expect(execute).not.toHaveBeenCalled();
    expect(harness.openai.lastInput).toBeNull();
    expect(top.consultantMessage.content).toContain('Alfa');
    expect(top.consultantMessage.content).toContain('Beta');
    expect(top.consultantMessage.content).toContain('Nos dados disponíveis');
    expect(top.consultantMessage.content).not.toContain('cobertura integral');
    expect(top.factualAnswer?.providerCalled).toBe(false);

    const second = await ask('E o segundo?');
    expect(second.consultantMessage.content).toContain('Beta');
    expect(second.consultantMessage.content).not.toContain('Alfa —');

    const paid = await ask('Quanto ele me pagou?');
    expect(paid.consultantMessage.content).toContain('Beta');
    expect(paid.consultantMessage.content).toContain('Nos dados disponíveis');
    expect(paid.consultantMessage.content).not.toContain('cobertura integral');

    const share = await ask('Quanto ele representou das minhas entradas?');
    expect(share.consultantMessage.content).toContain('Beta');
    expect(share.consultantMessage.content).toContain('%');
    expect(share.consultantMessage.content).toContain('entradas observadas');

    const july = await ask('E em julho?');
    expect(july.consultantMessage.content).toContain('Nilo');
    expect(july.consultantMessage.content).not.toContain('Beta');

    const suppliers = await ask('E fornecedores?');
    expect(suppliers.consultantMessage.content).toContain('Oficina');
    expect(suppliers.consultantMessage.content).not.toContain('Nilo');

    const firstSupplier = await ask('E o primeiro?');
    expect(firstSupplier.consultantMessage.content).toContain('Oficina');
    expect(firstSupplier.consultantMessage.content).not.toContain('Alfa');

    await ask('Qual categoria teve maior entrada em agosto de 2026?').catch(() => undefined);
    expect(parseAnalyticalConversationState(harness.state.get('tenant-a:conv-a'))).toBeNull();

    const otherConversation = await ask('E o primeiro?', 'conv-b');
    expect(otherConversation.consultantMessage.content).not.toContain('Oficina');
    expect(otherConversation.consultantMessage.content).not.toContain('Alfa');

    const otherTenant = await ask('E o segundo?', 'conv-a', 'tenant-b');
    expect(otherTenant.consultantMessage.content).not.toContain('Oficina');
    expect(otherTenant.consultantMessage.content).not.toContain('Beta');
  });

  it('reproduz a cadeia homologada quando fornecedores não fecham ranking', async () => {
    const harness = createHarness({
      counterpartyIdentity: {
        async load(input) {
          if (input.direction === 'OUTFLOW') {
            return [
              movement({
                amount: '40',
                partyId: null,
                sameScope: false,
                displayName: null,
                profiles: [],
                origin: 'MISSING',
              }),
            ];
          }
          if (input.period.kind === 'MONTH' && input.period.monthKey === '2026-07') {
            return [movement({ amount: '30', partyId: 'n', displayName: 'Nilo' })];
          }
          return [
            movement({ amount: '70', partyId: 'a', displayName: 'Alfa' }),
            movement({ amount: '40', partyId: 'b', displayName: 'Beta' }),
          ];
        },
      },
    });
    const ask = (question: string) =>
      harness.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-homolog',
        question,
        now: NOW,
      });

    const top = await ask('Quais foram os clientes que mais me pagaram em agosto de 2026?');
    expect(top.consultantMessage.content).toContain('Alfa');
    expect(top.consultantMessage.content).toContain('Beta');
    expect(top.consultantMessage.content).toContain('Nos dados disponíveis');
    expect(top.factualAnswer?.providerCalled).toBe(false);

    const second = await ask('E o segundo?');
    expect(second.consultantMessage.content).toContain('posição 2');
    expect(second.consultantMessage.content).toContain('Beta');

    const paid = await ask('Quanto ele me pagou?');
    expect(paid.consultantMessage.content).toContain('Beta');
    expect(paid.consultantMessage.content).toContain('Nos dados disponíveis');

    const share = await ask('Quanto ele representou das minhas entradas?');
    expect(share.consultantMessage.content).toContain('Beta');
    expect(share.consultantMessage.content).toContain('%');
    expect(share.consultantMessage.content).toContain('entradas observadas');

    const july = await ask('E em julho?');
    expect(july.consultantMessage.content).toContain('Nilo');
    expect(july.consultantMessage.content).not.toContain('Beta');

    const suppliers = await ask('E fornecedores?');
    expect(suppliers.consultantMessage.content).toContain('Há pagamentos nos dados disponíveis');
    expect(suppliers.consultantMessage.content).toContain('nenhum fornecedor está identificado');
    expect(suppliers.consultantMessage.content).not.toContain('Alfa');
    expect(suppliers.consultantMessage.content).not.toContain('Nilo');

    const first = await ask('E o primeiro?');
    expect(first.consultantMessage.content).toContain('Não há a posição 1');
    expect(first.consultantMessage.content).toContain('fornecedores');
    expect(first.consultantMessage.content).not.toContain('Alfa');
    expect(first.consultantMessage.content).not.toContain('Nilo');
    expect(first.factualAnswer?.providerCalled).toBe(false);
  });
});

function createHarness(options: {
  readonly analyticalTools?: { execute: ReturnType<typeof vi.fn> };
  readonly counterpartyIdentity?: {
    load: (input: {
      readonly direction: 'INFLOW' | 'OUTFLOW';
      readonly period: AnalyticalQuery['period'];
    }) => Promise<readonly CounterpartyMovementInput[]>;
  };
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'provider' });
  const anthropic = createFakeIaProvider({ id: 'ANTHROPIC' });
  const messages: AiMessageRecord[] = [];
  const state = new Map<string, unknown>();
  let messageSeq = 0;
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return { ...settings(), tenantId };
      },
    },
    conversations: {
      async findConversation(tenantId, _userId, conversationId) {
        return conversation(tenantId, conversationId, state.get(`${tenantId}:${conversationId}`) ?? null);
      },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle(tenantId, conversationId) {
        return conversation(tenantId, conversationId, state.get(`${tenantId}:${conversationId}`) ?? null);
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter((item) => item.tenantId === tenantId && item.conversationId === conversationId);
      },
      async saveAnalyticalContext(tenantId, conversationId, context) {
        state.set(`${tenantId}:${conversationId}`, context);
        return true;
      },
    },
    runs: {
      async createRun() {
        throw new Error('run inesperado');
      },
      async updateRun() {
        throw new Error('update inesperado');
      },
    },
    context: {
      build: vi.fn(async () => ({ tenantId: 'tenant-a', monthKey: '2026-08', blocks: [] }) satisfies AdvisorBuiltContext),
      withDocumentKnowledge: vi.fn(async (built: AdvisorBuiltContext) => built),
    },
    providers: createIaProviderRegistry({ openai, anthropic }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    analyticalTools: options.analyticalTools,
    counterpartyIdentity: options.counterpartyIdentity,
  });
  return { send, openai, state };
}

function settings(): AiTenantSettingsRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: 'set-a',
    tenantId: 'tenant-a',
    provider: 'OPENAI',
    model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    businessSegment: 'Serviços',
    businessDescription: 'Empresa genérica',
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

function conversation(tenantId: string, id: string, analyticalContext: unknown): AiConversationRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id,
    tenantId,
    userId: 'user-a',
    status: 'OPEN',
    title: 'já definida',
    analyticalContext,
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
