import { loadEnvironment, type Environment } from '../../../config/env.js';
import {
  createAnthropicProvider,
  createFakeIaProvider,
  createIaProviderRegistry,
  createOpenAiProvider,
  type IaProviderRegistry,
} from '../../../infrastructure/ai/index.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createMonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createAdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import type { AdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import { createAdvisorKnowledgeRepository } from '../repositories/advisor-knowledge.repository.js';
import { createAdvisorRunRepository } from '../repositories/advisor-run.repository.js';
import { createAdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import { createBuildAdvisorContext } from '../services/build-advisor-context.js';
import {
  createSendAdvisorMessage,
  type SendAdvisorMessage,
} from '../services/send-advisor-message.js';

export const FAKE_OPENAI_CONSULTANT_TEXT = 'Resposta simulada OpenAI do Consultor.';
export const FAKE_ANTHROPIC_CONSULTANT_TEXT = 'Resposta simulada Anthropic do Consultor.';

export type AdvisorRuntimeEnvironment = Pick<
  Environment,
  'nodeEnv' | 'openaiApiKey' | 'anthropicApiKey'
>;

export type AdvisorRuntime = {
  readonly settings: AdvisorSettingsRepository;
  readonly conversations: AdvisorConversationRepository;
  readonly send: SendAdvisorMessage;
  readonly providers: IaProviderRegistry;
  readonly nodeEnv: string;
  readonly openaiApiKey: string | null;
  readonly anthropicApiKey: string | null;
};

export type CreateAdvisorRuntimeOptions = {
  readonly environment?: AdvisorRuntimeEnvironment;
  readonly send?: SendAdvisorMessage;
};

/**
 * Registry de teste: dois Fakes com textos distintos (A≠B).
 * Fora de test: adapters reais; keys podem ser null (generate falha só na chamada).
 */
export function createAdvisorIaProviderRegistry(
  environment: AdvisorRuntimeEnvironment,
): IaProviderRegistry {
  if (environment.nodeEnv === 'test') {
    return createIaProviderRegistry({
      openai: createFakeIaProvider({ id: 'OPENAI', text: FAKE_OPENAI_CONSULTANT_TEXT }),
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC', text: FAKE_ANTHROPIC_CONSULTANT_TEXT }),
    });
  }

  return createIaProviderRegistry({
    openai: createOpenAiProvider({ apiKey: environment.openaiApiKey }),
    anthropic: createAnthropicProvider({ apiKey: environment.anthropicApiKey }),
  });
}

export function createAdvisorRuntime(options: CreateAdvisorRuntimeOptions = {}): AdvisorRuntime {
  const environment = options.environment ?? loadEnvironment();
  const prisma = getPrismaClient();
  const settings = createAdvisorSettingsRepository(prisma);
  const knowledge = createAdvisorKnowledgeRepository(prisma);
  const conversations = createAdvisorConversationRepository(prisma);
  const runs = createAdvisorRunRepository(prisma);
  const receivables = createReceivableReadRepository(prisma);
  const payables = createPayableReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
  const analytics = createAnalyticsService({
    receivables,
    payables,
    categories,
    costCenterAllocations,
  });
  const cashFlow = createMonthlyCashFlowService({
    ledger: createLedgerReadRepository(prisma),
    receivables,
    payables,
    categories,
    costCenterAllocations,
  });
  const context = createBuildAdvisorContext({
    settings,
    knowledge,
    conversations,
    cashFlow,
    analytics,
  });
  const providers = createAdvisorIaProviderRegistry(environment);
  const send =
    options.send ??
    createSendAdvisorMessage({
      settings,
      conversations,
      runs,
      context,
      providers,
    });

  return {
    settings,
    conversations,
    send,
    providers,
    nodeEnv: environment.nodeEnv,
    openaiApiKey: environment.openaiApiKey,
    anthropicApiKey: environment.anthropicApiKey,
  };
}
