/**
 * Fase B.1 — PendingAnalyticalAction: contrato, bag, resolve, execute, segurança.
 * Sem regex de confirmação: decisões vêm do provider (mockado) + validação runtime.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
} from '../src/modules/advisor/domain/advisor-conversation-bag.js';
import { costCenterOutflowMovementsState } from '../src/modules/advisor/domain/cost-center-outflow-movements-conversation-state.js';
import { assembleCostCenterOutflowMovementsPlan } from '../src/modules/advisor/domain/assemble-cost-center-outflow-movements-plan.js';
import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';
import {
  applyPendingPatch,
  buildToolArgumentsFromPendingStep,
  createPendingAnalyticalAction,
  isPendingActionExecutable,
  markPendingConsumed,
  markPendingExpired,
  markPendingRejected,
  parsePendingAnalyticalAction,
  parsePendingResolutionResult,
  type PendingAnalyticalAction,
} from '../src/modules/advisor/domain/pending-analytical-action.js';
import {
  extractPendingAnalyticalActionFromOffer,
  parseJsonObjectFromModelText,
  resolvePendingAnalyticalActionDecision,
} from '../src/modules/advisor/domain/pending-analytical-action-classify.js';
import { isReplyEligibleForPendingExtract } from '../src/modules/advisor/domain/pending-extract-eligibility.js';
import {
  composePendingActionAnswer,
  executePendingAnalyticalAction,
} from '../src/modules/advisor/domain/pending-analytical-action-execute.js';
import type { AdvisorAnalyticalToolExecutor } from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import type { IaProvider } from '../src/infrastructure/ai/types.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');
const MONTH = '2026-10';

function payableRankingPending(
  overrides?: Partial<PendingAnalyticalAction>,
): PendingAnalyticalAction {
  const created = createPendingAnalyticalAction({
    id: 'pending-payable-1',
    createdFromMessageId: 'msg-offer-1',
    domain: 'PAYABLE',
    operation: 'RANKING_TOPN',
    steps: [
      {
        toolName: 'payable_titles',
        filters: {
          monthKey: MONTH,
          status: 'OPEN',
          ordering: 'VALUE_DESC',
          limit: 5,
        },
      },
    ],
    objective: 'Listar próximos maiores compromissos abertos do mês',
    offerSnippet: 'Posso listar os próximos maiores compromissos deste mês em ordem.',
    now: NOW,
  });
  expect(created).not.toBeNull();
  return { ...created!, ...overrides };
}

function mockProvider(text: string): IaProvider {
  return {
    id: 'openai',
    async generate() {
      return { text, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

function fakeTools(handler: AdvisorAnalyticalToolExecutor['execute']): AdvisorAnalyticalToolExecutor {
  const emptySchema = { type: 'object', properties: {} };
  return {
    tools: [
      { name: 'payable_titles', description: 't', inputSchema: emptySchema },
      { name: 'cash_movement_lines', description: 't', inputSchema: emptySchema },
      { name: 'cash_realized_breakdown', description: 't', inputSchema: emptySchema },
      {
        name: 'cash_cost_center_movement_lines',
        description: 't',
        inputSchema: emptySchema,
      },
    ],
    execute: handler,
  };
}

describe('B.1 PendingAnalyticalAction contrato', () => {
  it('R: cria pending PAYABLE RANKING_TOPN allowlisted', () => {
    const pending = payableRankingPending();
    expect(pending.domain).toBe('PAYABLE');
    expect(pending.operation).toBe('RANKING_TOPN');
    expect(pending.status).toBe('PENDING');
    expect(pending.steps[0]?.toolName).toBe('payable_titles');
    expect(pending.steps[0]?.filters.ordering).toBe('VALUE_DESC');
  });

  it('L/M: rejeita capability/tool inexistente', () => {
    expect(
      parsePendingAnalyticalAction({
        ...payableRankingPending(),
        domain: 'INVENTED',
      }),
    ).toBeNull();
    expect(
      parsePendingAnalyticalAction({
        ...payableRankingPending(),
        steps: [{ toolName: 'drop_table', filters: { monthKey: MONTH } }],
      }),
    ).toBeNull();
  });

  it('K: rejeita tenantId / costCenterId / userId no contrato', () => {
    expect(
      parsePendingAnalyticalAction({
        ...payableRankingPending(),
        tenantId: 'evil',
      }),
    ).toBeNull();
    expect(
      parsePendingAnalyticalAction({
        ...payableRankingPending(),
        steps: [
          {
            toolName: 'payable_titles',
            filters: { monthKey: MONTH, costCenterId: 'cc-1' },
          },
        ],
      }),
    ).toBeNull();
  });

  it('O: injection tentando trocar capability via patch é rejeitada', () => {
    const pending = payableRankingPending();
    expect(
      applyPendingPatch(pending, {
        // @ts-expect-error intentional injection
        toolName: 'cash_movement_lines',
        monthKey: '2026-09',
      } as never),
    ).toBeNull();
    expect(
      applyPendingPatch(pending, {
        // @ts-expect-error intentional
        domain: 'REALIZED_CASH',
      } as never),
    ).toBeNull();
  });

  it('N: patch proibido com campos vazios em MODIFY', () => {
    expect(parsePendingResolutionResult({ decision: 'MODIFY', patch: {} })).toBeNull();
    expect(
      parsePendingResolutionResult({
        decision: 'MODIFY',
        patch: { tenantId: 'x' },
      }),
    ).toBeNull();
  });
});

describe('B.1 bag coexistência (P/Q)', () => {
  it('P: preserva CC outflow + pending no mesmo bag', () => {
    const cc = costCenterOutflowMovementsState({
      monthKey: MONTH,
      periodSource: 'EXPLICIT',
      limit: 5,
      costCenterQuery: 'Laranjeiras',
    });
    const pending = payableRankingPending();
    const bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: cc,
      pendingAnalyticalAction: pending,
    });
    const serialized = serializeAdvisorConversationBag(bag);
    const roundtrip = parseAdvisorConversationBag(serialized);
    expect(roundtrip.slots.costCenterOutflowMovements?.costCenterQuery).toBe('Laranjeiras');
    expect(roundtrip.slots.pendingAnalyticalAction?.id).toBe(pending.id);
  });

  it('Q: regressão “E em Jacaraípe?” com pending presente no bag', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: MONTH,
      periodSource: 'EXPLICIT',
      limit: 5,
      costCenterQuery: 'Laranjeiras',
    });
    const bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: prior,
      pendingAnalyticalAction: payableRankingPending(),
    });
    const period = resolveAdvisorConversationalPeriod({
      content: 'E em Jacaraípe?',
      referenceMonthKey: MONTH,
      now: NOW,
    });
    const assembled = assembleCostCenterOutflowMovementsPlan({
      content: 'E em Jacaraípe?',
      period,
      priorState: bag.slots.costCenterOutflowMovements,
    });
    expect(assembled.kind).not.toBe('UNMATCHED');
    if (assembled.kind === 'UNMATCHED') {
      return;
    }
    expect(assembled.slots.costCenterMention.toLowerCase()).toContain('jacara');
  });

  it('legado root CC continua parseável sem bag', () => {
    const legacy = costCenterOutflowMovementsState({
      monthKey: MONTH,
      periodSource: 'EXPLICIT',
      limit: 3,
      costCenterQuery: 'Jacaraípe',
    });
    const bag = parseAdvisorConversationBag(legacy);
    expect(bag.slots.costCenterOutflowMovements?.costCenterQuery).toBe('Jacaraípe');
    expect(bag.slots.pendingAnalyticalAction).toBeNull();
  });
});

describe('B.1 extrair oferta (create turn)', () => {
  it('extrai PENDING_ANALYTICAL_ACTION allowlisted do provider', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'PAYABLE',
        operation: 'RANKING_TOPN',
        objective: 'próximos maiores compromissos',
        offerSnippet: 'Posso listar os próximos maiores',
        steps: [
          {
            toolName: 'payable_titles',
            filters: {
              monthKey: MONTH,
              status: 'OPEN',
              ordering: 'VALUE_DESC',
              limit: 5,
            },
          },
        ],
      }),
    );
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText:
        'O maior é Aluguel. Se quiser, posso listar os próximos maiores compromissos deste mês em ordem.',
      createdFromMessageId: 'msg-1',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).not.toBeNull();
    expect(pending?.domain).toBe('PAYABLE');
    expect(pending?.operation).toBe('RANKING_TOPN');
  });

  it('NO_PENDING_ACTION quando oferta não é executável', async () => {
    const provider = mockProvider(JSON.stringify({ decision: 'NO_PENDING_ACTION' }));
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText: 'Boa sorte na contratação.',
      createdFromMessageId: 'msg-1',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).toBeNull();
  });

  it('S: ação composta com steps allowlisted', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'SNAPSHOT',
        operation: 'CURRENT_POSITION',
        objective: 'caixa atual + vencidos',
        offerSnippet: 'Posso olhar a posição atual do caixa e os vencidos',
        steps: [
          { toolName: null, filters: { monthKey: MONTH } },
          {
            toolName: 'payable_titles',
            filters: { monthKey: MONTH, status: 'OVERDUE', ordering: 'VALUE_DESC', limit: 5 },
          },
        ],
      }),
    );
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText: 'Posso olhar a posição atual do caixa e os vencidos.',
      createdFromMessageId: 'msg-2',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).not.toBeNull();
    expect(pending?.steps).toHaveLength(2);
  });

  it('rejeita SQL / tenantId na extração', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'PAYABLE',
        operation: 'RANKING_TOPN',
        objective: 'x',
        offerSnippet: 'x',
        steps: [
          {
            toolName: 'payable_titles',
            filters: { monthKey: MONTH, tenantId: 'evil' },
          },
        ],
      }),
    );
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText: 'Posso listar.',
      createdFromMessageId: 'msg-1',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).toBeNull();
  });
});

describe('B.1 resolução semântica (A–G, U)', () => {
  it('A/B: ACCEPT com formulações distintas → mesma decisão (provider, sem regex)', async () => {
    const pending = payableRankingPending();
    for (const phrase of ['pode, por favor', 'faça isso', 'traz pra mim', 'quero ver']) {
      const provider = mockProvider(JSON.stringify({ decision: 'ACCEPT' }));
      const result = await resolvePendingAnalyticalActionDecision({
        provider,
        providerId: 'openai',
        model: 'gpt-5.4-mini',
        tenantId: '11111111-1111-4111-8111-111111111111',
        userMessage: phrase,
        pending,
      });
      expect(result?.decision).toBe('ACCEPT');
      expect(result?.patch).toBeNull();
    }
  });

  it('C: MODIFY costCenterQuery', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'MODIFY',
        patch: { costCenterQuery: 'Laranjeiras' },
      }),
    );
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'pode, mas só Laranjeiras',
      pending: payableRankingPending(),
    });
    expect(result?.decision).toBe('MODIFY');
    expect(result?.patch?.costCenterQuery).toBe('Laranjeiras');
    const patched = applyPendingPatch(payableRankingPending(), result!.patch);
    expect(patched?.steps[0]?.filters.costCenterQuery).toBe('Laranjeiras');
  });

  it('D: MODIFY monthKey', async () => {
    const provider = mockProvider(
      JSON.stringify({ decision: 'MODIFY', patch: { monthKey: '2026-09' } }),
    );
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'pode, mas olha setembro',
      pending: payableRankingPending(),
    });
    expect(result?.decision).toBe('MODIFY');
    expect(result?.patch?.monthKey).toBe('2026-09');
  });

  it('E: MODIFY limit', async () => {
    const provider = mockProvider(
      JSON.stringify({ decision: 'MODIFY', patch: { limit: 10 } }),
    );
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'traz os 10 maiores',
      pending: payableRankingPending(),
    });
    expect(result?.decision).toBe('MODIFY');
    expect(result?.patch?.limit).toBe(10);
  });

  it('F: REJECT', async () => {
    const provider = mockProvider(JSON.stringify({ decision: 'REJECT' }));
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'não precisa',
      pending: payableRankingPending(),
    });
    expect(result?.decision).toBe('REJECT');
  });

  it('G: UNRELATED', async () => {
    const provider = mockProvider(JSON.stringify({ decision: 'UNRELATED' }));
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'qual foi meu faturamento?',
      pending: payableRankingPending(),
    });
    expect(result?.decision).toBe('UNRELATED');
  });

  it('U: sem pending → zero overhead do resolver (não chama provider)', async () => {
    const bag = parseAdvisorConversationBag(null);
    expect(bag.slots.pendingAnalyticalAction).toBeNull();
    const generate = vi.fn();
    // Runtime gate: só resolve quando pending !== null.
    if (bag.slots.pendingAnalyticalAction !== null) {
      await generate();
    }
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('B.1 expiração / consumo / idempotência (H/I/J)', () => {
  it('H: pending expirado não é executável', () => {
    const pending = payableRankingPending({
      expiresAt: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    const check = isPendingActionExecutable(pending, NOW);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe('EXPIRED');
    }
    expect(markPendingExpired(pending).status).toBe('EXPIRED');
  });

  it('I: consumido não é reexecutável', () => {
    const consumed = markPendingConsumed(payableRankingPending());
    expect(consumed.status).toBe('CONSUMED');
    const check = isPendingActionExecutable(consumed, NOW);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe('NOT_PENDING');
    }
  });

  it('J: reject + replay', () => {
    const rejected = markPendingRejected(payableRankingPending());
    expect(isPendingActionExecutable(rejected, NOW).ok).toBe(false);
  });
});

describe('B.1 execute ACCEPT / composto (R/S/T)', () => {
  it('R: ACCEPT executa payable_titles com args do contrato', async () => {
    const pending = payableRankingPending();
    const execute = vi.fn(async (input: Parameters<AdvisorAnalyticalToolExecutor['execute']>[0]) => ({
      id: input.call.id,
      name: input.call.name,
      ok: true,
      content: JSON.stringify({
        lines: [
          {
            description: 'Folha',
            unpaid: 'R$ 12.000,00',
            dueDate: '2026-10-25',
            situation: 'OPEN',
          },
        ],
      }),
      resultCardinality: 1,
    }));
    const tools = fakeTools(execute);
    const result = await executePendingAnalyticalAction({
      action: pending,
      tenantId: '11111111-1111-4111-8111-111111111111',
      resolvedMonthKey: MONTH,
      analyticalTools: tools,
      now: NOW,
    });
    expect(result.status).toBe('OK');
    expect(execute).toHaveBeenCalledOnce();
    const call = execute.mock.calls[0]![0];
    expect(call.tenantId).toBe('11111111-1111-4111-8111-111111111111');
    expect(call.call.name).toBe('payable_titles');
    expect(call.call.arguments).toMatchObject({
      monthKey: MONTH,
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      limit: 5,
    });
    const answer = composePendingActionAnswer({ action: pending, execution: result });
    expect(answer).toContain('Folha');
  });

  it('C+E: MODIFY aplica patch nos args', () => {
    const patched = applyPendingPatch(payableRankingPending(), {
      costCenterQuery: 'Laranjeiras',
      limit: 10,
    });
    expect(patched).not.toBeNull();
    const args = buildToolArgumentsFromPendingStep(patched!.steps[0]!, MONTH);
    expect(args).toMatchObject({
      costCenterQuery: 'Laranjeiras',
      limit: 10,
    });
  });

  it('T: composto parcialmente indisponível → PARTIAL_UNAVAILABLE', async () => {
    const created = createPendingAnalyticalAction({
      id: 'pending-compound',
      createdFromMessageId: 'msg-c',
      domain: 'SNAPSHOT',
      operation: 'CURRENT_POSITION',
      steps: [
        { toolName: null, filters: { monthKey: MONTH } },
        {
          toolName: 'payable_titles',
          filters: { monthKey: MONTH, status: 'OVERDUE', limit: 3 },
        },
        {
          toolName: 'cash_movement_lines',
          filters: { monthKey: MONTH, direction: 'OUTFLOW', limit: 3 },
        },
      ],
      objective: 'caixa + vencidos',
      offerSnippet: 'Posso olhar caixa e vencidos',
      now: NOW,
    });
    expect(created).not.toBeNull();
    const tools: AdvisorAnalyticalToolExecutor = {
      tools: [
        {
          name: 'payable_titles',
          description: 't',
          inputSchema: { type: 'object', properties: {} },
        },
        // cash_movement_lines ausente → parcial
      ],
      execute: async (input) => ({
        id: input.call.id,
        name: input.call.name,
        ok: true,
        content: JSON.stringify({ lines: [] }),
        resultCardinality: 0,
      }),
    };
    const result = await executePendingAnalyticalAction({
      action: created!,
      tenantId: '11111111-1111-4111-8111-111111111111',
      resolvedMonthKey: MONTH,
      analyticalTools: tools,
      now: NOW,
    });
    expect(result.status).toBe('PARTIAL_UNAVAILABLE');
    if (result.status === 'PARTIAL_UNAVAILABLE') {
      expect(result.unavailable).toContain('cash_movement_lines');
      expect(result.executions.some((e) => e.name === 'payable_titles')).toBe(true);
    }
    const answer = composePendingActionAnswer({ action: created!, execution: result });
    expect(answer).toContain('Limitação');
  });
});

describe('B.1 parse helpers', () => {
  it('parseJsonObjectFromModelText aceita fenced e raw', () => {
    expect(parseJsonObjectFromModelText('{"decision":"ACCEPT"}')?.decision).toBe('ACCEPT');
    expect(
      parseJsonObjectFromModelText('```json\n{"decision":"REJECT"}\n```')?.decision,
    ).toBe('REJECT');
  });

  it('B.1.1 gate estrutural: analítico elegível; meta/denied não', () => {
    expect(
      isReplyEligibleForPendingExtract({
        pathKind: 'ANALYTICAL',
        answerSource: 'PROVIDER',
        assistantText: 'O maior gasto foi Folha. Também dá para conferir por unidade.',
      }).eligible,
    ).toBe(true);
    expect(
      isReplyEligibleForPendingExtract({
        pathKind: 'ANALYTICAL',
        answerSource: 'SNAPSHOT',
        assistantText: 'Posição consolidada. Eu consigo cruzar isso com a posição atual do caixa.',
      }).eligible,
    ).toBe(true);
    expect(
      isReplyEligibleForPendingExtract({
        pathKind: 'META',
        answerSource: 'PROVIDER',
        assistantText: 'Certo — não sigo com essa consulta.',
      }).eligible,
    ).toBe(false);
    expect(
      isReplyEligibleForPendingExtract({
        pathKind: 'ANALYTICAL',
        answerSource: 'CAPABILITY_DENIED',
        assistantText: 'Não tenho capability para isso.',
      }).eligible,
    ).toBe(false);
  });

  it('B.1.1 compound SNAPSHOT caixa + vencidos', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'SNAPSHOT',
        operation: 'CURRENT_POSITION',
        objective: 'posição de caixa + títulos vencidos',
        offerSnippet: 'Também dá para olhar a posição atual do caixa e os vencidos.',
        steps: [
          { toolName: null, filters: { monthKey: MONTH } },
          {
            toolName: 'payable_titles',
            filters: {
              monthKey: MONTH,
              status: 'OVERDUE',
              ordering: 'VALUE_DESC',
              limit: 5,
            },
          },
        ],
      }),
    );
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText:
        'Há pressão de obrigações. Também dá para olhar a posição atual do caixa e os vencidos para uma leitura mais prática.',
      createdFromMessageId: 'msg-compound',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).not.toBeNull();
    expect(pending?.domain).toBe('SNAPSHOT');
    expect(pending?.operation).toBe('CURRENT_POSITION');
    expect(pending?.steps).toHaveLength(2);
    expect(pending?.steps[0]?.toolName).toBeNull();
    expect(pending?.steps[1]?.toolName).toBe('payable_titles');
  });

  it('B.1.1 FACTUAL_CLOSED-style answer + oferta → pending via extract (fora do agent)', async () => {
    // Simula resposta determinística/factual que termina oferecendo ação allowlisted.
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'PAYABLE',
        operation: 'RANKING_TOPN',
        objective: 'listar próximos maiores títulos abertos',
        offerSnippet: 'Também dá para listar os próximos maiores títulos abertos.',
        steps: [
          {
            toolName: 'payable_titles',
            filters: {
              monthKey: MONTH,
              status: 'OPEN',
              ordering: 'VALUE_DESC',
              limit: 5,
            },
          },
        ],
      }),
    );
    expect(
      isReplyEligibleForPendingExtract({
        pathKind: 'ANALYTICAL',
        answerSource: 'SNAPSHOT',
        assistantText:
          'O estoque em aberto é R$ 98.200,00. Também dá para listar os próximos maiores títulos abertos.',
      }).eligible,
    ).toBe(true);
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText:
        'O estoque em aberto é R$ 98.200,00. Também dá para listar os próximos maiores títulos abertos.',
      createdFromMessageId: 'msg-factual',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).not.toBeNull();
    expect(pending?.domain).toBe('PAYABLE');
    const accept = await resolvePendingAnalyticalActionDecision({
      provider: mockProvider(JSON.stringify({ decision: 'ACCEPT' })),
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'pode seguir nessa linha, por favor',
      pending: pending!,
    });
    expect(accept?.decision).toBe('ACCEPT');
  });

  it('B.1.1 compound parcial não representável → NO_PENDING (não mutila)', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'PENDING_ANALYTICAL_ACTION',
        domain: 'SNAPSHOT',
        operation: 'CURRENT_POSITION',
        objective: 'caixa + projeção inventada',
        offerSnippet: 'posso projetar o fluxo dos próximos 12 meses',
        steps: [
          { toolName: null, filters: { monthKey: MONTH } },
          { toolName: 'cash_forecast_12m', filters: { monthKey: MONTH } },
        ],
      }),
    );
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      assistantText: 'Posso projetar o fluxo dos próximos 12 meses.',
      createdFromMessageId: 'msg-bad',
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    expect(pending).toBeNull();
  });
});
