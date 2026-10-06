import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';
import { createAdvisorAnalyticalResultRepository } from '../src/modules/advisor/repositories/advisor-analytical-result.repository.js';
import { createAdvisorConversationRepository } from '../src/modules/advisor/repositories/advisor-conversation.repository.js';
import { createAdvisorRunRepository } from '../src/modules/advisor/repositories/advisor-run.repository.js';
import { createUserRepository } from '../src/modules/auth/repositories/user.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const conversations = createAdvisorConversationRepository(prisma);
const runs = createAdvisorRunRepository(prisma);
const results = createAdvisorAnalyticalResultRepository(prisma);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedQuestion(name: string) {
  const tenant = await tenants.create({ name, displayName: name });
  const user = await users.create({
    name,
    email: `${name}@trail.test`,
    role: 'USER',
    tenantId: tenant.id,
    status: 'ACTIVE',
  });
  const conversation = await conversations.createConversation(tenant.id, user.id, { title: name });
  const userMessage = await conversations.createMessage(tenant.id, conversation.id, {
    senderType: 'USER',
    content: `Pergunta secreta ${name} valor 987654.32`,
  });
  const consultantMessage = await conversations.createMessage(tenant.id, conversation.id, {
    senderType: 'CONSULTANT',
    content: `Resposta secreta ${name}`,
  });
  const run = await runs.createRun(tenant.id, {
    userId: user.id,
    conversationId: conversation.id,
    messageId: userMessage.id,
    provider: 'OPENAI',
    model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    status: 'SUCCEEDED',
    inputTokens: 3,
    outputTokens: 4,
  });
  return { tenant, user, conversation, userMessage, consultantMessage, run };
}

describe('persistência da trilha analítica', () => {
  it('vincula pergunta, resposta, run e tenant sem copiar o texto', async () => {
    const first = await seedQuestion('trail-a');
    const second = await seedQuestion('trail-b');
    await results.record(first.tenant.id, {
      conversationId: first.conversation.id,
      userMessageId: first.userMessage.id,
      consultantMessageId: first.consultantMessage.id,
      runId: first.run.id,
      outcome: 'UNSUPPORTED',
      answerSource: 'PROVIDER',
      toolCallCount: 1,
      toolRoundCount: 1,
      unresolvedDimension: 'COST_CENTER',
      unresolvedEntity: 'centro ausente',
      durationMs: 15,
      traces: [
        {
          round: 1,
          toolName: 'cash_cost_center_lookup',
          known: true,
          status: 'NOT_FOUND',
          reason: 'ENTITY_NOT_FOUND',
          durationMs: 15,
          resultCardinality: 0,
        },
      ],
    });
    await results.record(second.tenant.id, {
      conversationId: second.conversation.id,
      userMessageId: second.userMessage.id,
      consultantMessageId: second.consultantMessage.id,
      runId: second.run.id,
      outcome: 'ANSWERED',
      answerSource: 'BILLING',
      toolCallCount: 0,
      toolRoundCount: 0,
      unresolvedDimension: null,
      unresolvedEntity: null,
      durationMs: 4,
      traces: [],
    });

    const listed = await results.list({ tenantId: first.tenant.id, limit: 20, offset: 0 });
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({
      tenantId: first.tenant.id,
      conversationId: first.conversation.id,
      userMessageId: first.userMessage.id,
      consultantMessageId: first.consultantMessage.id,
      runId: first.run.id,
      outcome: 'UNSUPPORTED',
      answerSource: 'PROVIDER',
      unresolvedEntity: 'centro ausente',
    });
    expect(listed.items[0]?.run).toMatchObject({
      provider: 'OPENAI',
      status: 'SUCCEEDED',
      inputTokens: 3,
      outputTokens: 4,
    });
    expect(JSON.stringify(listed.items[0])).not.toContain('987654.32');
    expect(JSON.stringify(listed.items[0])).not.toContain('Pergunta secreta');
    expect(JSON.stringify(listed.items[0])).not.toContain('Resposta secreta');

    const unsupported = await results.list({
      tenantId: first.tenant.id,
      outcome: 'UNSUPPORTED',
      limit: 20,
      offset: 0,
    });
    expect(unsupported.total).toBe(1);
    const answered = await results.list({
      tenantId: first.tenant.id,
      outcome: 'ANSWERED',
      limit: 20,
      offset: 0,
    });
    expect(answered.total).toBe(0);
  });

  it('recusa vínculo com mensagem de outro tenant', async () => {
    const first = await seedQuestion('trail-c');
    const second = await seedQuestion('trail-d');
    await expect(
      results.record(first.tenant.id, {
        conversationId: second.conversation.id,
        userMessageId: second.userMessage.id,
        consultantMessageId: second.consultantMessage.id,
        runId: second.run.id,
        outcome: 'UNSUPPORTED',
        answerSource: 'PROVIDER',
        toolCallCount: 0,
        toolRoundCount: 0,
        unresolvedDimension: null,
        unresolvedEntity: null,
        durationMs: null,
        traces: [],
      }),
    ).rejects.toBeInstanceOf(AdvisorDomainError);
  });
});
