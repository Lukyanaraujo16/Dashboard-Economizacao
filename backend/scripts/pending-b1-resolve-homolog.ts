/**
 * Homologação B.1 — resolução semântica com pending pré-seedado + gpt-5.4-mini.
 * Uso: cd backend && npx tsx scripts/pending-b1-resolve-homolog.ts
 */
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { createPendingAnalyticalAction } from '../src/modules/advisor/domain/pending-analytical-action.js';
import { resolvePendingAnalyticalActionDecision } from '../src/modules/advisor/domain/pending-analytical-action-classify.js';

loadRootEnvFile();

async function main() {
  const NOW = new Date('2026-10-15T15:00:00.000Z');
  const pending = createPendingAnalyticalAction({
    id: 'homolog-seed-1',
    createdFromMessageId: 'msg-offer',
    domain: 'PAYABLE',
    operation: 'RANKING_TOPN',
    steps: [
      {
        toolName: 'payable_titles',
        filters: {
          monthKey: '2026-10',
          status: 'OPEN',
          ordering: 'VALUE_DESC',
          limit: 5,
        },
      },
    ],
    objective: 'Listar próximos maiores compromissos abertos do mês',
    offerSnippet: 'Se quiser, posso listar os próximos maiores compromissos deste mês em ordem.',
    now: NOW,
  });
  if (pending === null) {
    throw new Error('pending seed inválido');
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente');
  }
  const provider = createOpenAiProvider({ apiKey });

  const phrases: Array<[string, string]> = [
    ['ACCEPT', 'manda ver então'],
    ['ACCEPT', 'fica à vontade pra trazer'],
    ['ACCEPT', 'bora, me mostra essa lista'],
    ['MODIFY', 'beleza, mas só Laranjeiras'],
    ['MODIFY', 'pode, mas olha setembro'],
    ['MODIFY', 'traz os 10 maiores'],
    ['REJECT', 'pode deixar, dispenso'],
    ['REJECT', 'não precisa'],
    ['UNRELATED', 'quanto faturou a empresa no mês passado?'],
    ['UNRELATED', 'qual foi meu faturamento?'],
  ];

  for (const [expect, phrase] of phrases) {
    const t0 = Date.now();
    const result = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'OPENAI',
      model: 'gpt-5.4-mini',
      tenantId: '11111111-1111-4111-8111-111111111111',
      userMessage: phrase,
      pending,
    });
    const ok = result?.decision === expect;
    console.log(
      JSON.stringify({
        ok,
        expect,
        phrase,
        got: result?.decision ?? null,
        patch: result?.patch ?? null,
        ms: Date.now() - t0,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
