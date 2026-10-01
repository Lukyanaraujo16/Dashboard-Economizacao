import type { IaProviderRegistry } from '../../../infrastructure/ai/ia-provider-registry.js';
import { IaProviderError } from '../../../infrastructure/ai/types.js';
import type { AiProviderId } from '../domain/types.js';
import { buildProactiveNarrationBlocks } from '../domain/proactive-narration-prompt.js';
import { logProactive } from '../domain/schedule-proactive-evaluation.js';
import type { AdvisorRunRepository } from '../repositories/advisor-run.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type { ProactiveInsightRepository } from '../repositories/proactive-insight.repository.js';

const NARRATION_TITLE_MAX = 180;
const NARRATION_CONTENT_MAX = 8_000;

export type ProactiveNarrationOutcome = 'narrated' | 'skipped' | 'failed';

function narrationTitle(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? text;
  return firstLine.trim().slice(0, NARRATION_TITLE_MAX);
}

function categorize(error: unknown): { readonly status: 'FAILED' | 'TIMEOUT'; readonly code: 'AUTH' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'CONTENT_REJECTED' | 'UNKNOWN' } {
  if (error instanceof IaProviderError) {
    if (error.code === 'TIMEOUT') {
      return { status: 'TIMEOUT', code: 'TIMEOUT' };
    }
    if (error.code === 'AUTH' || error.code === 'CONTENT_REJECTED') {
      return { status: 'FAILED', code: error.code };
    }
    return { status: 'FAILED', code: 'PROVIDER_ERROR' };
  }
  return { status: 'FAILED', code: 'UNKNOWN' };
}

export function createProactiveNarrationService(deps: {
  readonly insights: ProactiveInsightRepository;
  readonly settings: AdvisorSettingsRepository;
  readonly runs: AdvisorRunRepository;
  readonly providers: IaProviderRegistry;
  readonly resolveProviderApiKey: (provider: AiProviderId) => Promise<string | null>;
}) {
  return {
    /**
     * Redige um insight já decidido. Não cria evento, não altera severidade
     * e não consome a cota de perguntas do usuário.
     */
    async narrate(input: {
      readonly tenantId: string;
      readonly insightId: string;
    }): Promise<ProactiveNarrationOutcome> {
      const started = Date.now();
      const insight = await deps.insights.findByTenant(input.tenantId, input.insightId);
      if (!insight || insight.narrationStatus === 'NARRATED') {
        return 'skipped';
      }

      const settings = await deps.settings.findSettingsByTenant(input.tenantId);
      if (!settings || settings.status !== 'ACTIVE') {
        logProactive('proactive_narration', {
          tenantId: input.tenantId,
          insightId: input.insightId,
          provider: null,
          model: null,
          result: 'skipped',
          durationMs: Date.now() - started,
          errorCode: null,
        });
        return 'skipped';
      }

      const credential = await deps.resolveProviderApiKey(settings.provider);
      if (!credential || credential.trim().length === 0) {
        await deps.insights.markNarrationFailed(input.tenantId, insight.id);
        await deps.runs.createRun(input.tenantId, {
          insightId: insight.id,
          runType: 'PROACTIVE_NARRATION',
          provider: settings.provider,
          model: settings.model,
          status: 'FAILED',
          errorCode: 'AUTH',
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        });
        logProactive('proactive_narration', {
          tenantId: input.tenantId,
          insightId: insight.id,
          provider: settings.provider,
          model: settings.model,
          result: 'failed',
          durationMs: Date.now() - started,
          errorCode: 'AUTH',
        });
        return 'failed';
      }

      try {
        const provider = deps.providers.resolve(settings.provider);
        const output = await provider.generate({
          tenantId: input.tenantId,
          provider: settings.provider,
          model: settings.model,
          blocks: buildProactiveNarrationBlocks({
            insightType: insight.insightType,
            severity: insight.severity,
            periodStart: insight.periodStart.toISOString().slice(0, 10),
            periodEnd: insight.periodEnd.toISOString().slice(0, 10),
            supportingData: insight.supportingData,
          }),
        });
        const content = output.text.trim().slice(0, NARRATION_CONTENT_MAX);
        if (content.length === 0) {
          throw new IaProviderError('CONTENT_REJECTED', 'Narrativa vazia.');
        }
        const saved = await deps.insights.saveNarration(input.tenantId, insight.id, {
          title: narrationTitle(content),
          content,
        });
        await deps.runs.createRun(input.tenantId, {
          insightId: insight.id,
          runType: 'PROACTIVE_NARRATION',
          provider: settings.provider,
          model: settings.model,
          status: 'SUCCEEDED',
          inputTokens: output.usage.inputTokens,
          outputTokens: output.usage.outputTokens,
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        });
        logProactive('proactive_narration', {
          tenantId: input.tenantId,
          insightId: insight.id,
          provider: settings.provider,
          model: settings.model,
          result: saved ? 'narrated' : 'skipped',
          durationMs: Date.now() - started,
          errorCode: null,
        });
        return saved ? 'narrated' : 'skipped';
      } catch (error) {
        const classified = categorize(error);
        await deps.insights.markNarrationFailed(input.tenantId, insight.id);
        await deps.runs.createRun(input.tenantId, {
          insightId: insight.id,
          runType: 'PROACTIVE_NARRATION',
          provider: settings.provider,
          model: settings.model,
          status: classified.status,
          errorCode: classified.code,
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        });
        logProactive('proactive_narration', {
          tenantId: input.tenantId,
          insightId: insight.id,
          provider: settings.provider,
          model: settings.model,
          result: 'failed',
          durationMs: Date.now() - started,
          errorCode: classified.code,
        });
        throw error;
      }
    },
  };
}
