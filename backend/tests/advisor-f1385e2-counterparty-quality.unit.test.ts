import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
} from '../src/modules/advisor/index.js';
import {
  assessCounterpartyWinner,
  resolveCounterpartyPeriodCoverage,
  type CounterpartyMovementInput,
  type CounterpartyPeriodCoverageStatus,
} from '../src/modules/advisor/domain/counterparty-identity-quality.js';
import { assessOfficialCounterpartyWinner } from '../src/modules/advisor/domain/load-counterparty-identity-population.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import type { AnalyticalQuery } from '../src/modules/advisor/domain/analytical/analytical-query.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';

const YEAR: AnalyticalQuery['period'] = {
  kind: 'YEAR',
  year: 2025,
  rangeKey: '2025',
  isPartialYear: false,
};

function query(profile: 'CUSTOMER' | 'SUPPLIER'): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: profile === 'CUSTOMER' ? 'INFLOW' : 'OUTFLOW',
    period: YEAR,
    dimension: 'COUNTERPARTY',
    operation: 'RANKING_WINNER',
    filters: { partyProfile: profile },
    limit: 1,
  };
}

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

function assess(
  movements: readonly CounterpartyMovementInput[],
  profile: 'CUSTOMER' | 'SUPPLIER',
  periodCoverage: CounterpartyPeriodCoverageStatus,
) {
  return assessCounterpartyWinner({
    movements,
    partyProfile: profile,
    direction: profile === 'CUSTOMER' ? 'INFLOW' : 'OUTFLOW',
    period: YEAR,
    periodCoverage,
    query: query(profile),
  });
}

describe('F13.8.5E.2 quality gate universal', () => {
  it('prova o vencedor só quando o líder supera o valor não atribuível', () => {
    const guaranteed = assess(
      [
        movement({ amount: '70', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '10', partyId: null, sameScope: false, displayName: null, profiles: [], origin: 'MISSING' }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(guaranteed.quality.winnerGuaranteed).toBe(true);
    expect(guaranteed.decision).toBe('AVAILABLE');
    expect(guaranteed.answer).toContain('Alfa');
    expect(guaranteed.answer).not.toContain('partyId');

    const equal = assess(
      [
        movement({ amount: '10', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '10', partyId: null, sameScope: false, displayName: null, profiles: [], origin: 'MISSING' }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(equal.quality.winnerGuaranteed).toBe(false);
    expect(equal.decision).toBe('PARTIAL');

    const hiddenWins = assess(
      [
        movement({ amount: '30', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '80', partyId: null, sameScope: false, displayName: null, profiles: [], origin: 'MISSING' }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(hiddenWins.quality.winnerGuaranteed).toBe(false);
    expect(hiddenWins.decision).toBe('PARTIAL');
    expect(hiddenWins.answer).toContain('sem cliente identificado');
  });

  it('agrega vários movimentos da mesma pessoa e isola tenant, perfil e direção', () => {
    const aggregated = assess(
      [
        movement({ amount: '40', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '40', partyId: 'a', displayName: 'Alfa' }),
        movement({ amount: '10', partyId: 'b', displayName: 'Beta' }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(aggregated.quality.topIdentifiedAmount).toBe('80.0000');
    expect(aggregated.quality.distinctIdentifiedParties).toBe(2);
    expect(aggregated.decision).toBe('AVAILABLE');

    const foreign = assess(
      [
        movement({ amount: '100', partyId: 'other', displayName: 'Outra Empresa', sameScope: false }),
        movement({ amount: '5', partyId: 'a', displayName: 'Alfa' }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(foreign.answer).not.toContain('Outra Empresa');
    expect(foreign.decision).not.toBe('AVAILABLE');

    const mismatch = assess(
      [
        movement({ amount: '100', profiles: ['SUPPLIER'], displayName: 'Fornecedor Oculto' }),
        movement({ amount: '10', partyId: 'a', displayName: 'Alfa', profiles: ['CUSTOMER'] }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(mismatch.decision).toBe('PARTIAL');
    expect(mismatch.quality.reasonCode ?? mismatch.reasonCode).toBe('PROFILE_MISMATCH');
    expect(mismatch.answer).not.toContain('Fornecedor Oculto');

    const bothProfiles = assess(
      [
        movement({
          amount: '50',
          partyId: 'mix',
          displayName: 'Mista',
          profiles: ['CUSTOMER', 'SUPPLIER'],
          origin: 'RECEIVABLE',
        }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(bothProfiles.decision).toBe('AVAILABLE');
    expect(bothProfiles.winnerName).toBe('Mista');

    const supplier = assess(
      [
        movement({
          amount: '90',
          partyId: 's1',
          displayName: 'Oficina',
          profiles: ['SUPPLIER'],
          origin: 'PAYABLE',
        }),
        movement({
          amount: '10',
          partyId: 's2',
          displayName: 'Papel',
          profiles: ['SUPPLIER'],
          origin: 'PAYABLE',
        }),
      ],
      'SUPPLIER',
      'COMPLETE',
    );
    expect(supplier.decision).toBe('AVAILABLE');
    expect(supplier.answer).toContain('Oficina');
    expect(supplier.quality.direction).toBe('OUTFLOW');

    const inflowOnPayable = assess(
      [
        movement({
          amount: '40',
          origin: 'PAYABLE',
          profiles: ['CUSTOMER'],
          displayName: 'Não é entrada',
        }),
      ],
      'CUSTOMER',
      'COMPLETE',
    );
    expect(inflowOnPayable.decision).toBe('UNAVAILABLE');
    expect(inflowOnPayable.answer).not.toContain('Não é entrada');
  });

  it('não transforma período desconhecido nem zero movimento em campeão ou em ausência financeira', () => {
    expect(resolveCounterpartyPeriodCoverage()).toBe('UNKNOWN');
    const perfectButUnproven = assess(
      [movement({ amount: '10', displayName: 'Alfa' })],
      'CUSTOMER',
      'UNKNOWN',
    );
    expect(perfectButUnproven.quality.winnerGuaranteed).toBe(true);
    expect(perfectButUnproven.decision).toBe('PARTIAL');
    expect(perfectButUnproven.reasonCode).toBe('PERIOD_COVERAGE_UNPROVEN');
    expect(perfectButUnproven.answer).not.toContain('foi quem mais');

    const emptyUnknown = assess([], 'SUPPLIER', 'UNKNOWN');
    expect(emptyUnknown.quality.countCoverageRatio).toBeNull();
    expect(emptyUnknown.quality.amountCoverageRatio).toBeNull();
    expect(emptyUnknown.decision).toBe('UNAVAILABLE');
    expect(emptyUnknown.answer).not.toContain('Não há pagamentos');

    const emptyComplete = assess([], 'CUSTOMER', 'COMPLETE');
    expect(emptyComplete.reasonCode).toBe('EMPTY_PERIOD');

    const noneIdentified = assess(
      [
        movement({ amount: '20', partyId: null, sameScope: false, displayName: null, profiles: [], origin: 'MISSING' }),
      ],
      'SUPPLIER',
      'COMPLETE',
    );
    expect(noneIdentified.decision).toBe('UNAVAILABLE');
    expect(noneIdentified.reasonCode).toBe('IDENTITY_ABSENT');
  });

  it('publica as capabilities sem exigir categoria e sem threshold', () => {
    const customer = validateAnalyticalCapability(query('CUSTOMER'));
    const supplier = validateAnalyticalCapability(query('SUPPLIER'));
    expect(customer.ok).toBe(true);
    expect(supplier.ok).toBe(true);
    const swapped = validateAnalyticalCapability({
      ...query('CUSTOMER'),
      direction: 'OUTFLOW',
      filters: { partyProfile: 'SUPPLIER' },
    });
    expect(swapped.ok).toBe(true);
    const wrongRole = validateAnalyticalCapability({
      ...query('CUSTOMER'),
      filters: { partyProfile: 'SUPPLIER' },
    });
    expect(wrongRole.ok).toBe(false);
  });

  it('no caminho oficial o período permanece UNKNOWN mesmo com identidade perfeita', async () => {
    const assessment = await assessOfficialCounterpartyWinner({
      tenantId: 'tenant-futuro',
      query: query('SUPPLIER'),
      service: {
        async load() {
          return [
            movement({
              amount: '100',
              partyId: 's',
              displayName: 'Fornecedor Futuro',
              profiles: ['SUPPLIER'],
              origin: 'PAYABLE',
            }),
          ];
        },
      },
    });
    expect(assessment.quality.periodCoverage).toBe('UNKNOWN');
    expect(assessment.quality.winnerGuaranteed).toBe(true);
    expect(assessment.decision).toBe('PARTIAL');
    expect(assessment.answer).not.toContain('tenant-futuro');
  });
});

describe('F13.8.5E.2 factual sem provider', () => {
  it('PARTIAL e UNAVAILABLE não chamam provider', async () => {
    const execute = vi.fn();
    const partial = createHarness({
      analyticalTools: { execute },
      counterpartyIdentity: {
        async load() {
          return [
            movement({ amount: '10', displayName: 'Alfa' }),
            movement({
              amount: '90',
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
    const partialResult = await partial.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual cliente mais me pagou em 2025?',
      now: new Date('2026-09-30T15:00:00.000Z'),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(partial.openai.lastInput).toBeNull();
    expect(partialResult.factualAnswer?.providerCalled).toBe(false);
    expect(partialResult.consultantMessage.content).toContain('Alfa');
    expect(partialResult.consultantMessage.content).toContain('sem cliente identificado');
    expect(partialResult.consultantMessage.content.toLowerCase()).not.toContain('convenio');

    const missing = createHarness({
      analyticalTools: { execute },
      counterpartyIdentity: {
        async load() {
          return [
            movement({
              amount: '50',
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
    const missingResult = await missing.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual fornecedor recebeu mais em 2025?',
      now: new Date('2026-09-30T15:00:00.000Z'),
    });
    expect(missing.openai.lastInput).toBeNull();
    expect(missingResult.factualAnswer?.providerCalled).toBe(false);
    expect(missingResult.consultantMessage.content).toContain('Não há identificação oficial suficiente');
    expect(missingResult.consultantMessage.content.toLowerCase()).not.toContain('convenio');
  });
});

function createHarness(options: {
  readonly analyticalTools?: { execute: ReturnType<typeof vi.fn> };
  readonly counterpartyIdentity?: { load: () => Promise<readonly CounterpartyMovementInput[]> };
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'provider' });
  const anthropic = createFakeIaProvider({ id: 'ANTHROPIC' });
  const messages: AiMessageRecord[] = [];
  let messageSeq = 0;
  const conversationRow = conversation();
  const send = createSendAdvisorMessage({
    settings: { async findSettingsByTenant() { return settings(); } },
    conversations: {
      async findConversation() { return conversationRow; },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle() { return conversationRow; },
      async listMessages(tenantId, conversationId) {
        return messages.filter((item) => item.tenantId === tenantId && item.conversationId === conversationId);
      },
    },
    runs: {
      async createRun() { throw new Error('run inesperado'); },
      async updateRun() { throw new Error('update inesperado'); },
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
  return { send, openai };
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
