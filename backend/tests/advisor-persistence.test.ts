import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import { createUserRepository, createTenantRepository } from '../src/modules/auth/index.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  createAdvisorConversationRepository,
  createAdvisorKnowledgeRepository,
  createAdvisorRunRepository,
  createAdvisorSettingsRepository,
} from '../src/modules/advisor/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

describe('persistência do Consultor (F13.1)', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const settings = createAdvisorSettingsRepository(prisma);
  const knowledge = createAdvisorKnowledgeRepository(prisma);
  const conversations = createAdvisorConversationRepository(prisma);
  const runs = createAdvisorRunRepository(prisma);

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória para testes de persistência.');
    }
  });

  afterEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  async function seedTenantUser(slug: string) {
    const tenant = await tenants.create({
      name: `t-${slug}`,
      displayName: `Empresa ${slug}`,
    });
    const user = await users.create({
      name: `User ${slug}`,
      email: `${slug}@acme.test`,
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });
    return { tenant, user };
  }

  it('não cria settings automaticamente para tenant existente', async () => {
    const { tenant } = await seedTenantUser('sem-ia');
    expect(await settings.findSettingsByTenant(tenant.id)).toBeNull();
    expect(await prisma.aiTenantSettings.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('settings é 1:1 por tenant e persiste OPENAI e ANTHROPIC com model string', async () => {
    const a = await seedTenantUser('settings-a');
    const b = await seedTenantUser('settings-b');

    const openai = await settings.upsertSettings(a.tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      businessSegment: 'Clínica',
      status: 'ACTIVE',
    });
    expect(openai.tenantId).toBe(a.tenant.id);
    expect(openai.provider).toBe('OPENAI');
    expect(typeof openai.model).toBe('string');
    expect(openai.model).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);

    const again = await settings.upsertSettings(a.tenant.id, {
      provider: 'ANTHROPIC',
      model: AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel,
      status: 'ACTIVE',
    });
    expect(again.id).toBe(openai.id);
    expect(again.provider).toBe('ANTHROPIC');
    expect(await prisma.aiTenantSettings.count({ where: { tenantId: a.tenant.id } })).toBe(1);

    const anthropicB = await settings.upsertSettings(b.tenant.id, {
      provider: 'ANTHROPIC',
      status: 'DISABLED',
    });
    expect(anthropicB.provider).toBe('ANTHROPIC');
    expect(anthropicB.model).toBe(AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel);

    expect(await settings.findSettingsByTenant(a.tenant.id)).toMatchObject({
      provider: 'ANTHROPIC',
      id: openai.id,
    });
    expect(await settings.findSettingsByTenant(b.tenant.id)).toMatchObject({
      id: anthropicB.id,
      provider: 'ANTHROPIC',
    });
    expect((await settings.findSettingsByTenant(a.tenant.id))?.id).not.toBe(anthropicB.id);

    await expect(
      prisma.aiTenantSettings.create({
        data: {
          tenantId: a.tenant.id,
          provider: 'OPENAI',
          model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
          status: 'DISABLED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejeita combinação provider/model inválida e não persiste API key', async () => {
    const { tenant } = await seedTenantUser('invalid-model');
    await expect(
      settings.upsertSettings(tenant.id, {
        provider: 'OPENAI',
        model: 'modelo-nao-permitido',
      }),
    ).rejects.toMatchObject({ code: 'AI_MODEL_NOT_ALLOWED' });
    expect(await settings.findSettingsByTenant(tenant.id)).toBeNull();

    const saved = await settings.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    });
    const columns = Object.keys(saved);
    expect(columns.some((key) => /api[_]?key/i.test(key))).toBe(false);
    const raw = await prisma.aiTenantSettings.findUnique({ where: { tenantId: tenant.id } });
    expect(raw).not.toBeNull();
    expect(JSON.stringify(raw)).not.toMatch(/sk-|api[_]?key/i);
  });

  it('isola knowledge entre tenants e impede alteração cruzada', async () => {
    const a = await seedTenantUser('know-a');
    const b = await seedTenantUser('know-b');

    const entryA = await knowledge.createKnowledge(a.tenant.id, {
      title: 'Protocolo clínica',
      content: 'Conhecimento da clínica A',
      createdById: a.user.id,
      status: 'ACTIVE',
    });
    const entryB = await knowledge.createKnowledge(b.tenant.id, {
      title: 'Protocolo escritório',
      content: 'Conhecimento do escritório B',
      createdById: b.user.id,
      status: 'ACTIVE',
    });

    const listA = await knowledge.listKnowledge(a.tenant.id);
    expect(listA.map((item) => item.id)).toEqual([entryA.id]);
    expect(await knowledge.findKnowledgeById(a.tenant.id, entryB.id)).toBeNull();
    expect(await knowledge.findKnowledgeById(b.tenant.id, entryA.id)).toBeNull();

    await expect(
      knowledge.updateKnowledge(a.tenant.id, entryB.id, { title: 'Invadido' }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_NOT_FOUND' });
    expect(await knowledge.findKnowledgeById(b.tenant.id, entryB.id)).toMatchObject({
      title: 'Protocolo escritório',
    });
  });

  it('conversa pertence a tenant+user e mensagens não cruzam tenant/conversa', async () => {
    const a = await seedTenantUser('chat-a');
    const b = await seedTenantUser('chat-b');

    const conversationA = await conversations.createConversation(a.tenant.id, a.user.id, {
      title: 'Conversa A',
    });
    const conversationB = await conversations.createConversation(b.tenant.id, b.user.id);

    expect(conversationA.tenantId).toBe(a.tenant.id);
    expect(conversationA.userId).toBe(a.user.id);
    expect(await conversations.findConversation(b.tenant.id, b.user.id, conversationA.id)).toBeNull();
    expect(await conversations.findConversation(a.tenant.id, b.user.id, conversationA.id)).toBeNull();

    const messageA = await conversations.createMessage(a.tenant.id, conversationA.id, {
      senderType: 'USER',
      content: 'Pergunta da clínica',
    });
    await conversations.createMessage(b.tenant.id, conversationB.id, {
      senderType: 'CONSULTANT',
      content: 'Resposta do escritório',
    });

    const messagesA = await conversations.listMessages(a.tenant.id, conversationA.id);
    expect(messagesA.map((item) => item.id)).toEqual([messageA.id]);
    expect(messagesA[0]?.tenantId).toBe(a.tenant.id);
    expect(await conversations.listMessages(b.tenant.id, conversationA.id)).toEqual([]);

    await expect(
      conversations.createMessage(b.tenant.id, conversationA.id, {
        senderType: 'USER',
        content: 'cruzamento',
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
    await expect(conversations.createConversation(a.tenant.id, b.user.id)).rejects.toMatchObject({
      code: 'USER_NOT_IN_TENANT',
    });
  });

  it('ai_runs preserva provider/model, sucesso e falha com error_code normalizado', async () => {
    const { tenant, user } = await seedTenantUser('runs');
    const conversation = await conversations.createConversation(tenant.id, user.id);
    const message = await conversations.createMessage(tenant.id, conversation.id, {
      senderType: 'USER',
      content: 'Quanto faturou?',
    });

    const success = await runs.createRun(tenant.id, {
      userId: user.id,
      conversationId: conversation.id,
      messageId: message.id,
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'SUCCEEDED',
      inputTokens: 10,
      outputTokens: 20,
      durationMs: 150,
      finishedAt: new Date(),
    });
    expect(success.provider).toBe('OPENAI');
    expect(success.model).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);
    expect(success.status).toBe('SUCCEEDED');
    expect(success.errorCode).toBeNull();

    const failed = await runs.createRun(tenant.id, {
      provider: 'ANTHROPIC',
      model: AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel,
      status: 'FAILED',
      errorCode: 'RATE_LIMIT',
      finishedAt: new Date(),
    });
    expect(failed.provider).toBe('ANTHROPIC');
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('RATE_LIMIT');

    const other = await seedTenantUser('runs-b');
    expect(await runs.findRunById(other.tenant.id, success.id)).toBeNull();
    expect(await runs.findRunById(tenant.id, success.id)).toMatchObject({ id: success.id });
  });

  it('cleaner remove dados de IA na ordem das FKs', async () => {
    const { tenant, user } = await seedTenantUser('cleaner');
    await settings.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      status: 'ACTIVE',
    });
    const entry = await knowledge.createKnowledge(tenant.id, {
      title: 'Doc',
      content: 'Texto',
      createdById: user.id,
    });
    const conversation = await conversations.createConversation(tenant.id, user.id);
    const message = await conversations.createMessage(tenant.id, conversation.id, {
      senderType: 'SYSTEM',
      content: 'início',
    });
    await runs.createRun(tenant.id, {
      userId: user.id,
      conversationId: conversation.id,
      messageId: message.id,
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'STARTED',
    });

    expect(await prisma.aiTenantSettings.count()).toBeGreaterThan(0);
    expect(await prisma.aiKnowledgeEntry.count()).toBeGreaterThan(0);
    expect(await prisma.aiConversation.count()).toBeGreaterThan(0);
    expect(await prisma.aiMessage.count()).toBeGreaterThan(0);
    expect(await prisma.aiRun.count()).toBeGreaterThan(0);

    await cleanTestDatabase(prisma);

    expect(await prisma.aiTenantSettings.count()).toBe(0);
    expect(await prisma.aiKnowledgeEntry.count()).toBe(0);
    expect(await prisma.aiConversation.count()).toBe(0);
    expect(await prisma.aiMessage.count()).toBe(0);
    expect(await prisma.aiRun.count()).toBe(0);
    expect(await prisma.tenant.count()).toBe(0);
    expect(entry.tenantId).toBe(tenant.id);
  });
});
