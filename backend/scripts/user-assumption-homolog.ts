/**
 * Homologação local — USER_ASSUMPTION + fatos oficiais (gpt-5.4-mini).
 * Efêmero — NÃO commit / NÃO altera config persistida.
 */
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { extractUserAnalyticalAssumption } from '../src/modules/advisor/domain/user-assumption-classify.js';
import {
  buildDerivedScenarioEvidence,
  serializeUserAssumptionsEvidenceBlock,
} from '../src/modules/advisor/domain/user-assumption-scenario.js';
import { applyUserAssumptionToList } from '../src/modules/advisor/domain/user-analytical-assumption.js';
import { gateAdvisorEvidenceBoundAnswer } from '../src/modules/advisor/domain/advisor-evidence-bound-answer.js';
import type { AdvisorContextBlock } from '../src/modules/advisor/domain/context-blocks.js';

loadRootEnvFile();

const TENANT = '11111111-1111-4111-8111-111111111111';
const MODEL = 'gpt-5.4-mini';
const NOW = new Date('2026-10-15T15:00:00.000Z');

const OFFICIAL_FACTS = [
  'monthKey: 2026-10',
  'entityScope: TENANT',
  'cash.realized.outflows: 847.05',
  'cash.realized.outflowsBrl: R$ 847,05',
  'cash.realized.result: 20905.62',
  'cash.realized.resultBrl: R$ 20.905,62',
  'payables.overdueInMonth: 6225.64',
  'payables.overdueInMonthBrl: R$ 6.225,64',
].join('\n');

const CONSULTANT_ASK =
  'Se você me passar o custo mensal estimado da contratação, eu consigo te dizer de forma objetiva se a posição atual comporta isso com margem ou se ficaria apertado.';

async function composeConditionalAnswer(input: {
  readonly provider: ReturnType<typeof createOpenAiProvider>;
  readonly assumptionBlock: string;
  readonly derivedBlock: string | null;
  readonly userMessage: string;
}): Promise<string> {
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: [
        'Responda em português, natural, sem dump técnico.',
        'Há USER_ASSUMPTIONS_BLOCK (premissa do usuário) e FINANCIAL_FACTS (oficiais).',
        'Use a premissa em análise CONDICIONAL. Nunca diga que é lançamento do ERP.',
        'Deixe claro que o valor foi informado/estimado pelo usuário.',
        'Não invente entidades. Use só cifras sustentadas pelos blocos.',
      ].join('\n'),
      trustLevel: 'PLATFORM',
    },
    {
      type: 'FINANCIAL_FACTS',
      content: OFFICIAL_FACTS,
      trustLevel: 'ANALYTICAL_FACT',
    },
    {
      type: 'ANALYTICAL_FACTS',
      content: input.assumptionBlock,
      trustLevel: 'ANALYTICAL_FACT',
    },
  ];
  if (input.derivedBlock !== null) {
    blocks.push({
      type: 'ANALYTICAL_FACTS',
      content: input.derivedBlock,
      trustLevel: 'ANALYTICAL_FACT',
    });
  }
  blocks.push({
    type: 'USER_QUESTION',
    content: [
      'RECENT_CONSULTANT:',
      CONSULTANT_ASK,
      'CURRENT_USER_MESSAGE:',
      input.userMessage,
    ].join('\n'),
    trustLevel: 'UNTRUSTED',
  });

  const generated = await input.provider.generate({
    tenantId: TENANT,
    provider: 'OPENAI',
    model: MODEL,
    blocks,
  });
  return (generated.text ?? '').trim();
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente');
  }
  const provider = createOpenAiProvider({ apiKey });

  console.log('=== Turno 3: premissa R$ 5 mil ===');
  const msg5k = 'Esse funcionário vai me custar uns R$ 5 mil por mês.';
  const extracted5k = await extractUserAnalyticalAssumption({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    userMessage: msg5k,
    createdFromMessageId: 'homolog-msg-5k',
    existingAssumptions: [],
    recentConsultantSnippet: CONSULTANT_ASK,
    now: NOW,
  });
  console.log(JSON.stringify({ extracted5k }, null, 2));
  if (extracted5k.decision !== 'USER_ASSUMPTION') {
    throw new Error('Esperava USER_ASSUMPTION para R$ 5 mil');
  }

  const assumptionBlock = serializeUserAssumptionsEvidenceBlock(extracted5k.assumptions);
  if (assumptionBlock === null) {
    throw new Error('bloco vazio');
  }
  const derived = buildDerivedScenarioEvidence({
    assumptions: extracted5k.assumptions,
    financialFactsText: OFFICIAL_FACTS,
  });
  const answer5k = await composeConditionalAnswer({
    provider,
    assumptionBlock,
    derivedBlock: derived,
    userMessage: msg5k,
  });
  console.log('--- resposta 5k ---\n', answer5k);

  const gated5k = gateAdvisorEvidenceBoundAnswer({
    answerText: answer5k,
    evidenceItems: [
      { text: OFFICIAL_FACTS, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
      { text: assumptionBlock, entityScope: 'TENANT', source: 'USER_ASSUMPTION' },
      ...(derived === null
        ? []
        : [{ text: derived, entityScope: 'TENANT' as const, source: 'SCENARIO_DERIVED' as const }]),
    ],
    agentToolPath: true,
    requiredEntityScope: 'UNKNOWN',
  });
  console.log(JSON.stringify({ gate5k: { ok: gated5k.ok, reason: gated5k.reason, unsupported: gated5k.unsupportedClaims } }));

  const lower = answer5k.toLowerCase();
  const treatsAsOfficial =
    /segundo os dados|nos fatos oficiais.*funcionário|lançamento.*5\.?000|erp.*5\.?000/.test(lower);
  const acknowledgesPremise =
    /informou|estimativa|considerando|você|premissa|cenário|hipótese/.test(lower);
  console.log(
    JSON.stringify({
      treatsAsOfficial,
      acknowledgesPremise,
      rejectsMissingOfficialFact: /não dá para confirmar|não há fato oficial/.test(lower),
    }),
  );

  console.log('\n=== Turno 4: altera para R$ 7 mil ===');
  const msg7k = 'Na verdade, coloca R$ 7 mil.';
  const extracted7k = await extractUserAnalyticalAssumption({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    userMessage: msg7k,
    createdFromMessageId: 'homolog-msg-7k',
    existingAssumptions: extracted5k.assumptions,
    recentConsultantSnippet: answer5k.slice(0, 400),
    now: NOW,
  });
  console.log(JSON.stringify({ extracted7k }, null, 2));
  if (extracted7k.decision !== 'USER_ASSUMPTION') {
    throw new Error('Esperava USER_ASSUMPTION para R$ 7 mil');
  }
  const list7k = applyUserAssumptionToList(
    extracted5k.assumptions,
    extracted7k.assumption,
  );
  // extract já aplica applyUserAssumptionToList — preferir lista do extract
  const finalList =
    extracted7k.decision === 'USER_ASSUMPTION' ? extracted7k.assumptions : list7k;
  const active = finalList.filter((row) => row.status === 'ACTIVE');
  console.log(
    JSON.stringify({
      activeValues: active.map((row) => row.value),
      superseded: finalList.filter((row) => row.status === 'SUPERSEDED').map((row) => row.value),
    }),
  );
  if (active.length !== 1 || active[0]?.value !== 7000) {
    throw new Error(`Esperava ACTIVE=7000, got ${JSON.stringify(active.map((a) => a.value))}`);
  }

  const block7k = serializeUserAssumptionsEvidenceBlock(finalList)!;
  const derived7k = buildDerivedScenarioEvidence({
    assumptions: finalList,
    financialFactsText: OFFICIAL_FACTS,
  });
  const answer7k = await composeConditionalAnswer({
    provider,
    assumptionBlock: block7k,
    derivedBlock: derived7k,
    userMessage: msg7k,
  });
  console.log('--- resposta 7k ---\n', answer7k);
  const gated7k = gateAdvisorEvidenceBoundAnswer({
    answerText: answer7k,
    evidenceItems: [
      { text: OFFICIAL_FACTS, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
      { text: block7k, entityScope: 'TENANT', source: 'USER_ASSUMPTION' },
      ...(derived7k === null
        ? []
        : [{ text: derived7k, entityScope: 'TENANT' as const, source: 'SCENARIO_DERIVED' as const }]),
    ],
    agentToolPath: true,
    requiredEntityScope: 'UNKNOWN',
  });
  console.log(JSON.stringify({ gate7k: { ok: gated7k.ok, reason: gated7k.reason, unsupported: gated7k.unsupportedClaims } }));

  const sumsBoth = /12\s*mil|12\.000|12000/.test(answer7k.replace(/\./g, ''));
  console.log(JSON.stringify({ incorrectlySums5kAnd7k: sumsBoth }));

  console.log('\n=== Homolog USER_ASSUMPTION OK ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
