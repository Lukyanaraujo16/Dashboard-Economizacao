/**
 * Homologação H — provenance × claim (gpt-5.4-mini). Efêmero — NÃO commit.
 */
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { extractUserAnalyticalAssumption } from '../src/modules/advisor/domain/user-assumption-classify.js';
import { listActiveUserAssumptions } from '../src/modules/advisor/domain/user-analytical-assumption.js';
import {
  buildDerivedScenarioEvidence,
  serializeUserAssumptionsEvidenceBlock,
} from '../src/modules/advisor/domain/user-assumption-scenario.js';
import {
  ADVISOR_EVIDENCE_PROVENANCE_LIMITATION_TEXT,
  gateAdvisorEvidenceBoundAnswer,
  resolveAdvisorNumericEvidenceMode,
} from '../src/modules/advisor/domain/advisor-evidence-bound-answer.js';
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
].join('\n');

async function compose(input: {
  readonly provider: ReturnType<typeof createOpenAiProvider>;
  readonly assumptionBlock: string;
  readonly derivedBlock: string | null;
  readonly userMessage: string;
  readonly recentConsultant: string;
}): Promise<string> {
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: [
        'Responda em português, natural, sem dump técnico.',
        'USER_ASSUMPTION ≠ fato oficial. SCENARIO_DERIVED ≠ resultado realizado.',
        'Se a pergunta pedir fato realizado e só houver premissa, diga a limitação.',
        'Não invente pagamento/lançamento.',
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
      input.recentConsultant,
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

function gateAnswer(input: {
  readonly answer: string;
  readonly assumptionBlock: string;
  readonly derivedBlock: string | null;
  readonly question: string;
  readonly activeValues: readonly number[];
}) {
  const mode = resolveAdvisorNumericEvidenceMode({
    question: input.question,
    activeAssumptionValues: input.activeValues,
  });
  const items = [
    { text: OFFICIAL_FACTS, entityScope: 'TENANT' as const, source: 'FINANCIAL_FACTS' as const },
    { text: input.assumptionBlock, entityScope: 'TENANT' as const, source: 'USER_ASSUMPTION' as const },
    ...(input.derivedBlock === null
      ? []
      : [
          {
            text: input.derivedBlock,
            entityScope: 'TENANT' as const,
            source: 'SCENARIO_DERIVED' as const,
          },
        ]),
  ];
  const gated = gateAdvisorEvidenceBoundAnswer({
    answerText: input.answer,
    evidenceItems: items,
    agentToolPath: true,
    numericEvidenceMode: mode,
  });
  return { mode, gated };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente');
  }
  const provider = createOpenAiProvider({ apiKey });

  console.log('=== 1) Premissa R$ 5 mil (cenário) ===');
  const msg5k = 'Esse funcionário vai me custar uns R$ 5 mil por mês.';
  const ex5 = await extractUserAnalyticalAssumption({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    userMessage: msg5k,
    createdFromMessageId: 'h-msg-5',
    existingAssumptions: [],
    recentConsultantSnippet:
      'Se você me passar o custo mensal estimado, consigo avaliar a posição.',
    now: NOW,
  });
  if (ex5.decision !== 'USER_ASSUMPTION') {
    throw new Error('esperava USER_ASSUMPTION');
  }
  let assumptions = ex5.assumptions;
  const block5 = serializeUserAssumptionsEvidenceBlock(assumptions)!;
  const derived5 = buildDerivedScenarioEvidence({
    assumptions,
    financialFactsText: OFFICIAL_FACTS,
  });
  const answer5 = await compose({
    provider,
    assumptionBlock: block5,
    derivedBlock: derived5,
    userMessage: msg5k,
    recentConsultant: 'me passe o custo mensal estimado',
  });
  const gate5 = gateAnswer({
    answer: answer5,
    assumptionBlock: block5,
    derivedBlock: derived5,
    question: msg5k,
    activeValues: listActiveUserAssumptions(assumptions).map((r) => r.value),
  });
  console.log(answer5);
  console.log(JSON.stringify({ mode: gate5.mode, gate: { ok: gate5.gated.ok, reason: gate5.gated.reason } }));
  if (gate5.mode !== 'SCENARIO_OR_OFFICIAL') {
    throw new Error('turno 1 deveria ser SCENARIO_OR_OFFICIAL');
  }

  console.log('\n=== 2) Pergunta factual — não promover ===');
  const msgFact = 'Quanto eu realmente paguei nesse funcionário?';
  const answerFact = await compose({
    provider,
    assumptionBlock: block5,
    derivedBlock: derived5,
    userMessage: msgFact,
    recentConsultant: answer5.slice(0, 400),
  });
  const gateFact = gateAnswer({
    answer: answerFact,
    assumptionBlock: block5,
    derivedBlock: derived5,
    question: msgFact,
    activeValues: listActiveUserAssumptions(assumptions).map((r) => r.value),
  });
  console.log(answerFact);
  console.log(
    JSON.stringify({
      mode: gateFact.mode,
      gate: {
        ok: gateFact.gated.ok,
        reason: gateFact.gated.reason,
        unsupported: gateFact.gated.unsupportedClaims,
      },
      promotedPay:
        /você pagou\s*r\$\s*5/i.test(answerFact) ||
        /paguei\s*r\$\s*5/i.test(answerFact) ||
        /pagamento\s+(?:realizado|oficial).*5\.?000/i.test(answerFact),
      stillHasAssumption: listActiveUserAssumptions(assumptions).length === 1,
      limitationTextSample: ADVISOR_EVIDENCE_PROVENANCE_LIMITATION_TEXT.slice(0, 80),
    }),
  );
  if (gateFact.mode !== 'OFFICIAL_ONLY') {
    throw new Error('turno factual deveria ser OFFICIAL_ONLY');
  }
  // Se o modelo promoveu, o gate deve falhar; se já respondeu com limitação sem cifra indevida, ok.
  if (/você pagou\s*r\$\s*5/i.test(answerFact) && gateFact.gated.ok) {
    throw new Error('promoção factual passou no gate');
  }
  if (!listActiveUserAssumptions(assumptions).length) {
    throw new Error('assumption não deveria ser apagada');
  }

  console.log('\n=== 3) Volta ao cenário R$ 7 mil ===');
  const msg7 = 'Tá, voltando à simulação, considera R$ 7 mil.';
  const ex7 = await extractUserAnalyticalAssumption({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    userMessage: msg7,
    createdFromMessageId: 'h-msg-7',
    existingAssumptions: assumptions,
    recentConsultantSnippet: answerFact.slice(0, 400),
    now: NOW,
  });
  if (ex7.decision !== 'USER_ASSUMPTION') {
    throw new Error('esperava USER_ASSUMPTION no 7 mil');
  }
  assumptions = ex7.assumptions;
  const active = listActiveUserAssumptions(assumptions);
  console.log(JSON.stringify({ active: active.map((a) => a.value), superseded: assumptions.filter((a) => a.status === 'SUPERSEDED').map((a) => a.value) }));
  if (active.length !== 1 || active[0]?.value !== 7000) {
    throw new Error('esperava ACTIVE=7000');
  }
  const block7 = serializeUserAssumptionsEvidenceBlock(assumptions)!;
  const derived7 = buildDerivedScenarioEvidence({
    assumptions,
    financialFactsText: OFFICIAL_FACTS,
  });
  const answer7 = await compose({
    provider,
    assumptionBlock: block7,
    derivedBlock: derived7,
    userMessage: msg7,
    recentConsultant: answerFact.slice(0, 400),
  });
  const gate7 = gateAnswer({
    answer: answer7,
    assumptionBlock: block7,
    derivedBlock: derived7,
    question: msg7,
    activeValues: active.map((a) => a.value),
  });
  console.log(answer7);
  console.log(
    JSON.stringify({
      mode: gate7.mode,
      gate: { ok: gate7.gated.ok, reason: gate7.gated.reason },
      sumsBoth: /12\s*mil|12000|12\.000/.test(answer7.replace(/\./g, '')),
      technicalDump: /USER_ASSUMPTIONS_BLOCK|assumptionId:|SCENARIO_DERIVED_BLOCK/.test(answer7),
    }),
  );
  if (gate7.mode !== 'SCENARIO_OR_OFFICIAL') {
    throw new Error('turno 7 mil deveria ser SCENARIO_OR_OFFICIAL');
  }

  console.log('\n=== Homolog H provenance OK ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
