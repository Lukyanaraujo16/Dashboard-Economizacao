import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Environment } from '../../../config/env.js';
import { createMonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { createExpenseCeilingRepository } from '../../dashboard/repositories/expense-ceiling.repository.js';
import { createRevenueGoalRepository } from '../../dashboard/repositories/revenue-goal.repository.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createAdvisorPlatformCredentialRepository } from '../repositories/advisor-platform-credential.repository.js';
import { createAdvisorRunRepository } from '../repositories/advisor-run.repository.js';
import { createAdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import { createProactiveInsightRepository } from '../repositories/proactive-insight.repository.js';
import { createProactiveTriggerRepository } from '../repositories/proactive-trigger.repository.js';
import {
  createAdvisorIaProviderRegistry,
  createResolveProviderApiKey,
} from '../http/create-advisor-runtime.js';
import { createProactiveNarrationService } from './proactive-narration.service.js';
import { createProactiveTriggerEngine } from './proactive-trigger-engine.service.js';
import { createProactiveTriggerService } from './proactive-trigger.service.js';

export function createProactiveEvaluationRuntime(prisma: PrismaClient, environment: Environment) {
  const triggers = createProactiveTriggerRepository(prisma);
  const receivables = createReceivableReadRepository(prisma);
  const payables = createPayableReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
  const engine = createProactiveTriggerEngine({
    triggers,
    triggerService: createProactiveTriggerService(triggers),
    cashFlow: createMonthlyCashFlowService({
      ledger: createLedgerReadRepository(prisma),
      receivables,
      payables,
      categories,
      costCenterAllocations,
    }),
    revenueGoals: createRevenueGoalRepository(prisma),
    expenseCeilings: createExpenseCeilingRepository(prisma),
    receivables,
    payables,
    parties: createPartyReadRepository(prisma),
    categories,
  });
  const insights = createProactiveInsightRepository(prisma);
  const platformCredentials = createAdvisorPlatformCredentialRepository(prisma);
  const resolveProviderApiKey = createResolveProviderApiKey({
    findEncryptedSecret: async (provider) => {
      const stored = await platformCredentials.findByProvider(provider);
      return stored?.encryptedSecret ?? null;
    },
    encryptionKey: environment.integrationEncryptionKey,
    envOpenAi: environment.openaiApiKey,
    envAnthropic: environment.anthropicApiKey,
  });
  const narration = createProactiveNarrationService({
    insights,
    settings: createAdvisorSettingsRepository(prisma),
    runs: createAdvisorRunRepository(prisma),
    providers: createAdvisorIaProviderRegistry(environment, resolveProviderApiKey),
    resolveProviderApiKey,
  });

  return {
    engine,
    insights,
    narrate: narration.narrate,
  };
}
