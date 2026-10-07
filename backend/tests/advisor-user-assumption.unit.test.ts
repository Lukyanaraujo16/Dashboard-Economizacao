/**
 * Fundação USER_ASSUMPTION — premissas explícitas do usuário × fatos oficiais.
 */
import { describe, expect, it } from 'vitest';

import {
  applyUserAssumptionToList,
  createUserAnalyticalAssumption,
  formatUserAssumptionEvidenceText,
  listActiveUserAssumptions,
  messageHasAssumptionMagnitudeCue,
  parseUserAnalyticalAssumption,
} from '../src/modules/advisor/domain/user-analytical-assumption.js';
import {
  extractUserAnalyticalAssumption,
  isEligibleForUserAssumptionExtract,
} from '../src/modules/advisor/domain/user-assumption-classify.js';
import {
  buildDerivedScenarioEvidence,
  readOfficialCashResultFromFacts,
  serializeUserAssumptionsEvidenceBlock,
} from '../src/modules/advisor/domain/user-assumption-scenario.js';
import {
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
} from '../src/modules/advisor/domain/advisor-conversation-bag.js';
import {
  applyAdvisorEvidenceBoundRewrite,
  gateAdvisorEvidenceBoundAnswer,
  looksLikeMutilatedMonetarySalvage,
  resolveAdvisorNumericEvidenceMode,
  stripUnsupportedMonetaryClaims,
} from '../src/modules/advisor/domain/advisor-evidence-bound-answer.js';
import type { GenerationInput, IaProvider } from '../src/infrastructure/ai/types.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');

function mockProvider(text: string): IaProvider {
  return {
    id: 'openai',
    async generate(input: GenerationInput) {
      void input;
      return { text, usage: { inputTokens: 1, outputTokens: 2 } };
    },
  };
}

function monthlyCost(value: number, id = 'a1') {
  return createUserAnalyticalAssumption({
    id,
    createdFromMessageId: 'msg-1',
    valueKind: 'AMOUNT',
    value,
    cadence: 'MONTHLY',
    role: 'COST',
    label: 'custo mensal estimado informado pelo usuário',
    now: NOW,
  })!;
}

describe('USER_ASSUMPTION contrato', () => {
  it('J: rejeita tenantId / costCenterId / SQL', () => {
    expect(
      parseUserAnalyticalAssumption({
        ...monthlyCost(5000),
        tenantId: 'evil',
      }),
    ).toBeNull();
    expect(
      parseUserAnalyticalAssumption({
        ...monthlyCost(5000),
        costCenterId: 'cc-1',
      }),
    ).toBeNull();
  });

  it('F: ONE_OFF ≠ MONTHLY', () => {
    const once = createUserAnalyticalAssumption({
      id: 'o1',
      createdFromMessageId: 'm',
      valueKind: 'AMOUNT',
      value: 30_000,
      cadence: 'ONE_OFF',
      role: 'COST',
      label: 'máquina',
      now: NOW,
    });
    const monthly = monthlyCost(5000, 'm1');
    expect(once?.cadence).toBe('ONE_OFF');
    expect(monthly.cadence).toBe('MONTHLY');
    expect(once?.cadence).not.toBe(monthly.cadence);
  });

  it('D: alteração de premissa supersede (não soma)', () => {
    const first = monthlyCost(5000, 'old');
    const second = createUserAnalyticalAssumption({
      id: 'new',
      createdFromMessageId: 'msg-2',
      valueKind: 'AMOUNT',
      value: 7000,
      cadence: 'MONTHLY',
      role: 'COST',
      label: 'custo mensal revisado',
      replacesAssumptionId: first.id,
      now: NOW,
    })!;
    const list = applyUserAssumptionToList([first], second);
    const active = listActiveUserAssumptions(list);
    expect(active).toHaveLength(1);
    expect(active[0]?.value).toBe(7000);
    expect(list.find((row) => row.id === first.id)?.status).toBe('SUPERSEDED');
  });
});

describe('USER_ASSUMPTION elegibilidade / extract', () => {
  it('gate estrutural: magnitude sem catálogo de frases', () => {
    expect(messageHasAssumptionMagnitudeCue('Esse funcionário vai me custar uns R$ 5 mil por mês.')).toBe(
      true,
    );
    expect(isEligibleForUserAssumptionExtract({ userMessage: 'como vai?' })).toBe(false);
  });

  it('A: premissa explícita → USER_ASSUMPTION', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'USER_ASSUMPTION',
        valueKind: 'AMOUNT',
        value: 5000,
        cadence: 'MONTHLY',
        role: 'COST',
        label: 'custo mensal da contratação',
        replacesPrior: false,
      }),
    );
    const result = await extractUserAnalyticalAssumption({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'Esse funcionário vai me custar uns R$ 5 mil por mês.',
      createdFromMessageId: 'msg-u',
      existingAssumptions: [],
      recentConsultantSnippet:
        'Se você me passar o custo mensal estimado, consigo dizer se a posição comporta.',
      now: NOW,
    });
    expect(result.decision).toBe('USER_ASSUMPTION');
    if (result.decision === 'USER_ASSUMPTION') {
      expect(result.assumption.value).toBe(5000);
      expect(result.assumption.cadence).toBe('MONTHLY');
      expect(result.assumption.kind).toBe('USER_ANALYTICAL_ASSUMPTION');
    }
  });

  it('B: pergunta oficial com cifra → NO_ASSUMPTION', async () => {
    const provider = mockProvider(JSON.stringify({ decision: 'NO_ASSUMPTION' }));
    const result = await extractUserAnalyticalAssumption({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'Meu aluguel foi R$ 5 mil este mês?',
      createdFromMessageId: 'msg-q',
      existingAssumptions: [],
      now: NOW,
    });
    expect(result.decision).toBe('NO_ASSUMPTION');
  });

  it('C: cenário hipotético delta', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'USER_ASSUMPTION',
        valueKind: 'DELTA_AMOUNT',
        value: 2000,
        cadence: 'MONTHLY',
        role: 'COST',
        label: 'aumento de aluguel',
        replacesPrior: false,
      }),
    );
    const result = await extractUserAnalyticalAssumption({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'E se meu aluguel subir R$ 2 mil por mês?',
      createdFromMessageId: 'msg-c',
      existingAssumptions: [],
      now: NOW,
    });
    expect(result.decision).toBe('USER_ASSUMPTION');
    if (result.decision === 'USER_ASSUMPTION') {
      expect(result.assumption.valueKind).toBe('DELTA_AMOUNT');
      expect(result.assumption.value).toBe(2000);
    }
  });

  it('E: percentual', async () => {
    const provider = mockProvider(
      JSON.stringify({
        decision: 'USER_ASSUMPTION',
        valueKind: 'PERCENT',
        value: 10,
        cadence: 'UNSPECIFIED',
        role: 'REVENUE',
        label: 'queda de faturamento',
        replacesPrior: false,
      }),
    );
    const result = await extractUserAnalyticalAssumption({
      provider,
      providerId: 'openai',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: 'E se meu faturamento cair 10%?',
      createdFromMessageId: 'msg-p',
      existingAssumptions: [],
      now: NOW,
    });
    expect(result.decision).toBe('USER_ASSUMPTION');
    if (result.decision === 'USER_ASSUMPTION') {
      expect(result.assumption.valueKind).toBe('PERCENT');
      expect(result.assumption.currency).toBeNull();
    }
  });
});

describe('USER_ASSUMPTION evidence / derived / bag', () => {
  it('G/I: gate autoriza cifra da premissa sem ser FINANCIAL_FACTS', () => {
    const assumption = monthlyCost(5000);
    const evidenceText = formatUserAssumptionEvidenceText(assumption);
    const official = 'cash.realized.result: 20905.62\ncash.realized.resultBrl: R$ 20.905,62';
    const derived = buildDerivedScenarioEvidence({
      assumptions: [assumption],
      financialFactsText: official,
    });
    expect(derived).not.toBeNull();
    expect(derived).toContain('DERIVED_FROM(OFFICIAL_FACT+USER_ASSUMPTION)');

    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Considerando os R$ 5.000,00 que você informou, o resultado oficial de R$ 20.905,62 ficaria mais apertado.',
      evidenceItems: [
        { text: official, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
        { text: evidenceText, entityScope: 'TENANT', source: 'USER_ASSUMPTION' },
        { text: derived!, entityScope: 'TENANT', source: 'SCENARIO_DERIVED' },
      ],
      agentToolPath: true,
      requiredEntityScope: 'UNKNOWN',
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gated.ok).toBe(true);

    const gatedMil = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Considerando os R$ 5 mil por mês que você informou, o resultado oficial de R$ 20.905,62 ficaria mais apertado.',
      evidenceItems: [
        { text: official, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
        { text: evidenceText, entityScope: 'TENANT', source: 'USER_ASSUMPTION' },
        { text: derived!, entityScope: 'TENANT', source: 'SCENARIO_DERIVED' },
      ],
      agentToolPath: true,
      requiredEntityScope: 'UNKNOWN',
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gatedMil.ok).toBe(true);
  });

  it('K: continuidade bag — premissa persiste e substitui sem somar', () => {
    const first = monthlyCost(5000, 'a-5k');
    let bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      userAssumptions: [first],
    });
    const second = createUserAnalyticalAssumption({
      id: 'a-7k',
      createdFromMessageId: 'msg-3',
      valueKind: 'AMOUNT',
      value: 7000,
      cadence: 'MONTHLY',
      role: 'COST',
      label: 'custo mensal revisado',
      now: NOW,
    })!;
    bag = mergeAdvisorConversationBag(bag, {
      userAssumptions: applyUserAssumptionToList(bag.slots.userAssumptions, second),
    });
    const active = listActiveUserAssumptions(bag.slots.userAssumptions);
    expect(active).toHaveLength(1);
    expect(active[0]?.value).toBe(7000);
    const derived = buildDerivedScenarioEvidence({
      assumptions: bag.slots.userAssumptions,
      financialFactsText: 'cash.realized.result: 20905.62',
    });
    expect(derived).toContain('7000.00');
    expect(derived).not.toContain('assumptionMonthlyCost: 5000.00');
  });

  it('gate ainda rejeita cifra inventada sem evidência', () => {
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'O custo oficial do funcionário é R$ 5.000,00.',
      evidenceItems: [
        {
          text: 'cash.realized.result: 20905.62\ncash.realized.resultBrl: R$ 20.905,62',
          entityScope: 'TENANT',
          source: 'FINANCIAL_FACTS',
        },
      ],
      agentToolPath: true,
      requiredEntityScope: 'UNKNOWN',
    });
    expect(gated.ok).toBe(false);
  });

  it('H: assumption não vira pagamento realizado (provenance no bloco)', () => {
    const block = serializeUserAssumptionsEvidenceBlock([monthlyCost(5000)]);
    expect(block).toContain('USER_ASSUMPTION');
    expect(block).toMatch(/not an official/i);
    expect(block).not.toContain('REALIZED_PAYMENT');
  });

  it('P: bag coexiste com pending/CC', () => {
    const assumption = monthlyCost(5000);
    const bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      userAssumptions: [assumption],
    });
    const roundtrip = parseAdvisorConversationBag(serializeAdvisorConversationBag(bag));
    expect(roundtrip.slots.userAssumptions).toHaveLength(1);
    expect(roundtrip.slots.userAssumptions[0]?.value).toBe(5000);
    expect(roundtrip.slots.pendingAnalyticalAction).toBeNull();
  });

  it('legado bag sem userAssumptions continua válido', () => {
    const bag = parseAdvisorConversationBag({
      version: 1,
      kind: 'ADVISOR_CONVERSATION_BAG',
      slots: {
        counterparty: null,
        costCenterOutflowMovements: null,
        dailyCashMovement: null,
        pendingAnalyticalAction: null,
      },
    });
    expect(bag.slots.userAssumptions).toEqual([]);
  });

  it('derived lê resultado de caixa dos facts', () => {
    expect(
      readOfficialCashResultFromFacts(
        'cash.realized.inflows: 21752.67\ncash.realized.outflows: 847.05',
      ),
    ).toBeCloseTo(20905.62, 1);
  });
});

describe('H — provenance × claim (USER_ASSUMPTION não autoriza fato)', () => {
  const officialCash =
    'cash.realized.result: 20905.62\ncash.realized.resultBrl: R$ 20.905,62';

  function scenarioEvidence(assumptionValue = 5000) {
    const assumption = monthlyCost(assumptionValue);
    const evidenceText = formatUserAssumptionEvidenceText(assumption);
    const derived = buildDerivedScenarioEvidence({
      assumptions: [assumption],
      financialFactsText: officialCash,
    })!;
    return {
      assumption,
      items: [
        { text: officialCash, entityScope: 'TENANT' as const, source: 'FINANCIAL_FACTS' as const },
        { text: evidenceText, entityScope: 'TENANT' as const, source: 'USER_ASSUMPTION' as const },
        { text: derived, entityScope: 'TENANT' as const, source: 'SCENARIO_DERIVED' as const },
      ],
      derived,
    };
  }

  it('brecha pré-fix: coincidência numérica da assumption autorizava claim factual', () => {
    const { items } = scenarioEvidence(5000);
    const leaked = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00 nesse funcionário.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(leaked.ok).toBe(true);
  });

  it('H1: assumption não autoriza pagamento factual (OFFICIAL_ONLY)', () => {
    const { items } = scenarioEvidence(5000);
    const question = 'Quanto eu realmente paguei nesse funcionário?';
    expect(
      resolveAdvisorNumericEvidenceMode({
        question,
        activeAssumptionValues: [5000],
      }),
    ).toBe('OFFICIAL_ONLY');

    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00 nesse funcionário.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
    expect(gated.text).toContain('R$ 5.000,00');
    expect(gated.text).toMatch(/premissa|estimativa|cenário/i);
    expect(gated.text).not.toMatch(/você pagou/i);
    expect(looksLikeMutilatedMonetarySalvage(gated.text)).toBe(false);
  });

  it('H2: mesma assumption autoriza cenário quando pergunta reancora magnitude', () => {
    const { items } = scenarioEvidence(5000);
    const question = 'Considerando aqueles R$ 5 mil, como ficaria meu caixa?';
    expect(
      resolveAdvisorNumericEvidenceMode({
        question,
        activeAssumptionValues: [5000],
      }),
    ).toBe('SCENARIO_OR_OFFICIAL');

    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Considerando os R$ 5.000,00 que você informou, o resultado oficial de R$ 20.905,62 ficaria mais apertado.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gated.ok).toBe(true);
  });

  it('H3: mesmo número — AUTHORIZA por OFFICIAL_FACT, não pela assumption', () => {
    const assumption = monthlyCost(5000);
    const items = [
      {
        text: 'paid.employee: 5000.00\npaid.employeeBrl: R$ 5.000,00',
        entityScope: 'TENANT' as const,
        source: 'FINANCIAL_FACTS' as const,
      },
      {
        text: formatUserAssumptionEvidenceText(assumption),
        entityScope: 'TENANT' as const,
        source: 'USER_ASSUMPTION' as const,
      },
    ];
    const onlyAssumption = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00.',
      evidenceItems: [items[1]!],
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(onlyAssumption.ok).toBe(false);
    expect(onlyAssumption.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');

    const withOfficial = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(withOfficial.ok).toBe(true);
  });

  it('H4: SCENARIO_DERIVED não vira resultado real', () => {
    const { items, derived } = scenarioEvidence(5000);
    expect(derived).toContain('15905.62');
    const question = 'Então meu resultado real é R$ 15.905,62?';
    expect(
      resolveAdvisorNumericEvidenceMode({
        question,
        activeAssumptionValues: [5000],
      }),
    ).toBe('OFFICIAL_ONLY');

    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Sim, seu resultado real é R$ 15.905,62.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
  });

  it('H5: pergunta factual não apaga assumption; 7000 supersede depois', () => {
    const first = monthlyCost(5000, 'a-5k');
    let bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      userAssumptions: [first],
    });
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Quanto eu realmente paguei nesse funcionário?',
        activeAssumptionValues: listActiveUserAssumptions(bag.slots.userAssumptions).map(
          (row) => row.value,
        ),
      }),
    ).toBe('OFFICIAL_ONLY');
    expect(listActiveUserAssumptions(bag.slots.userAssumptions)).toHaveLength(1);

    const second = createUserAnalyticalAssumption({
      id: 'a-7k',
      createdFromMessageId: 'msg-7',
      valueKind: 'AMOUNT',
      value: 7000,
      cadence: 'MONTHLY',
      role: 'COST',
      label: 'custo mensal revisado',
      now: NOW,
    })!;
    bag = mergeAdvisorConversationBag(bag, {
      userAssumptions: applyUserAssumptionToList(bag.slots.userAssumptions, second),
    });
    const active = listActiveUserAssumptions(bag.slots.userAssumptions);
    expect(active).toHaveLength(1);
    expect(active[0]?.value).toBe(7000);
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Tá, voltando à simulação, considera R$ 7 mil.',
        activeAssumptionValues: active.map((row) => row.value),
      }),
    ).toBe('SCENARIO_OR_OFFICIAL');
  });

  it('H6: sem assumption — mode OFFICIAL_ONLY e gate factual preservado', () => {
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Qual foi o resultado de caixa?',
        activeAssumptionValues: [],
      }),
    ).toBe('OFFICIAL_ONLY');
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'O resultado de caixa foi R$ 20.905,62.',
      evidenceItems: [
        { text: officialCash, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
      ],
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(true);
  });

  it('H7: cifra inventada continua bloqueada com assumption+official', () => {
    const { items } = scenarioEvidence(5000);
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Considerando sua premissa, o impacto seria R$ 99.999,00.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('UNSUPPORTED_NUMERIC_CLAIMS');
  });

  it('gate com scenario evidence roda mesmo sem agentToolPath', () => {
    const { items } = scenarioEvidence(5000);
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00.',
      evidenceItems: items,
      agentToolPath: false,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
  });
});

describe('H composition — provenance failure nunca mutila resposta', () => {
  const officialCash =
    'cash.realized.result: 21113.07\ncash.realized.resultBrl: R$ 21.113,07';

  function itemsFor(assumptionValue: number) {
    const assumption = monthlyCost(assumptionValue);
    const derived = buildDerivedScenarioEvidence({
      assumptions: [assumption],
      financialFactsText: officialCash,
    })!;
    return {
      assumption,
      derived,
      items: [
        { text: officialCash, entityScope: 'TENANT' as const, source: 'FINANCIAL_FACTS' as const },
        {
          text: formatUserAssumptionEvidenceText(assumption),
          entityScope: 'TENANT' as const,
          source: 'USER_ASSUMPTION' as const,
        },
        { text: derived, entityScope: 'TENANT' as const, source: 'SCENARIO_DERIVED' as const },
      ],
    };
  }

  function assertCompleteSafeAnswer(text: string) {
    expect(text.trim().length).toBeGreaterThan(40);
    expect(looksLikeMutilatedMonetarySalvage(text)).toBe(false);
    expect(text).not.toMatch(/(?:^|\n)\s*000,00/);
    expect(text).not.toMatch(/(?:^|\n)\s*113,07/);
    expect(text).not.toMatch(/você pagou\s*r\$\s*5/i);
    expect(text).toMatch(/premissa|estimativa|cenário/i);
    expect(text).toContain('R$ 5.000,00');
  }

  it('repro pré-fix: strip+salvage mutilava milhar BR em frase com vários R$', () => {
    const answer =
      'Os R$ 5.000,00 que você informou levam o cenário a R$ 16.113,07 frente ao resultado oficial de R$ 21.113,07. Se você quiser, eu também posso te ajudar a comparar isso com o faturamento do mês.';
    const stripped = stripUnsupportedMonetaryClaims(answer, ['R$ 5.000,00', 'R$ 16.113,07']);
    // Com máscara de milhar o strip deixa de gerar "113,07..." órfão.
    expect(looksLikeMutilatedMonetarySalvage(stripped)).toBe(false);
    expect(stripped).not.toMatch(/(?:^|\n)\s*113,07/);
  });

  it('T1: factual sem official — limitation completa (não salvage)', () => {
    const { items } = itemsFor(5000);
    const providerAnswer =
      'Os R$ 5.000,00 que você informou levam o cenário a R$ 16.113,07 frente ao resultado oficial de R$ 21.113,07. Se você quiser, eu também posso te ajudar a comparar isso com o faturamento do mês.';
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: providerAnswer,
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');

    const delivered = applyAdvisorEvidenceBoundRewrite({
      original: gated,
      rejectedAnswerText: providerAnswer,
      rewriteText: providerAnswer,
      evidenceItems: items,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(delivered.ok).toBe(false);
    expect(delivered.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
    expect(delivered.text).toBe(gated.text);
    assertCompleteSafeAnswer(delivered.text);
  });

  it('T2: assumption referenciada como premissa (não como pagamento)', () => {
    const { items } = itemsFor(5000);
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'A estimativa de R$ 5.000,00 não prova pagamento. Oficial: R$ 21.113,07.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
    assertCompleteSafeAnswer(gated.text);
    expect(gated.text).toMatch(/não (posso confirmar|um pagamento)|não um pagamento/i);
  });

  it('T3: OFFICIAL correspondente autoriza 5000 factual', () => {
    const assumption = monthlyCost(5000);
    const items = [
      {
        text: 'paid.amount: 5000.00\npaid.amountBrl: R$ 5.000,00',
        entityScope: 'TENANT' as const,
        source: 'FINANCIAL_FACTS' as const,
      },
      {
        text: formatUserAssumptionEvidenceText(assumption),
        entityScope: 'TENANT' as const,
        source: 'USER_ASSUMPTION' as const,
      },
    ];
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(true);
  });

  it('T4: cenário continua com SCENARIO_OR_OFFICIAL', () => {
    const { items } = itemsFor(5000);
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Considerando os R$ 5 mil, como fica meu caixa?',
        activeAssumptionValues: [5000],
      }),
    ).toBe('SCENARIO_OR_OFFICIAL');
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Considerando os R$ 5.000,00 que você informou, o resultado oficial de R$ 21.113,07 ficaria em R$ 16.113,07.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gated.ok).toBe(true);
  });

  it('T5: derived não vira resultado real', () => {
    const { items } = itemsFor(5000);
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Então meu resultado real foi R$ 16.113,07?',
        activeAssumptionValues: [5000],
      }),
    ).toBe('OFFICIAL_ONLY');
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Sim, seu resultado real foi R$ 16.113,07.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
  });

  it('T6: nenhum fragmento após provenance paths', () => {
    const { items } = itemsFor(5000);
    const samples = [
      'Os R$ 5.000,00 que você informou são estimativa.',
      'Considerando os R$ 5.000,00 do cenário e R$ 16.113,07 derivado vs R$ 21.113,07 oficial.',
      'A estimativa de R$ 5.000,00 não é pagamento. Se você quiser, eu também posso te ajudar a comparar isso com o faturamento do mês.',
    ];
    for (const sample of samples) {
      const gated = gateAdvisorEvidenceBoundAnswer({
        answerText: sample,
        evidenceItems: items,
        agentToolPath: true,
        numericEvidenceMode: 'OFFICIAL_ONLY',
      });
      const delivered = applyAdvisorEvidenceBoundRewrite({
        original: gated,
        rejectedAnswerText: sample,
        rewriteText: sample,
        evidenceItems: items,
        numericEvidenceMode: 'OFFICIAL_ONLY',
      });
      expect(looksLikeMutilatedMonetarySalvage(delivered.text)).toBe(false);
      expect(delivered.text).not.toMatch(/(?:^|\n)\s*000,00/);
      expect(delivered.text).not.toMatch(/(?:^|\n)\s*113,07/);
    }
  });

  it('T7: lifecycle — factual não apaga; 7000 supersede', () => {
    const first = monthlyCost(5000, 'a-5k');
    let bag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      userAssumptions: [first],
    });
    const { items } = itemsFor(5000);
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Você pagou R$ 5.000,00.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'OFFICIAL_ONLY',
    });
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_PROVENANCE');
    expect(listActiveUserAssumptions(bag.slots.userAssumptions)).toHaveLength(1);

    const second = createUserAnalyticalAssumption({
      id: 'a-7k',
      createdFromMessageId: 'm7',
      valueKind: 'AMOUNT',
      value: 7000,
      cadence: 'MONTHLY',
      role: 'COST',
      label: 'custo revisado',
      now: NOW,
    })!;
    bag = mergeAdvisorConversationBag(bag, {
      userAssumptions: applyUserAssumptionToList(bag.slots.userAssumptions, second),
    });
    const active = listActiveUserAssumptions(bag.slots.userAssumptions);
    expect(active.map((row) => row.value)).toEqual([7000]);
    expect(
      resolveAdvisorNumericEvidenceMode({
        question: 'Tá, voltando à simulação, considera R$ 7 mil.',
        activeAssumptionValues: active.map((row) => row.value),
      }),
    ).toBe('SCENARIO_OR_OFFICIAL');
  });

  it('T8: invented number continua bloqueada', () => {
    const { items } = itemsFor(5000);
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'O impacto inventado seria R$ 99.999,00.',
      evidenceItems: items,
      agentToolPath: true,
      numericEvidenceMode: 'SCENARIO_OR_OFFICIAL',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('UNSUPPORTED_NUMERIC_CLAIMS');
  });

  it('strip não deixa órfãos com claim curto R$ 5', () => {
    const text =
      'Os R$ 5.000,00 que você informou. Oficial R$ 21.113,07. Se você quiser, eu também posso te ajudar a comparar isso com o faturamento do mês.';
    const stripped = stripUnsupportedMonetaryClaims(text, ['R$ 5']);
    // Prefixo curto não pode casar dentro de R$ 5.000,00 (senão virava "000,00...").
    expect(stripped).toContain('R$ 5.000,00');
    expect(stripped).not.toMatch(/(?:^|\n)\s*000,00/);
    expect(looksLikeMutilatedMonetarySalvage(stripped)).toBe(false);
  });
});
