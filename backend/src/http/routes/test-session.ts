import type { FastifyInstance } from 'fastify';

/**
 * Rotas exclusivas do ambiente de teste para exercitar o store Redis
 * sem implementar login de produto.
 */
export async function registerTestSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/__test__/session', async (request, reply) => {
    const body = request.body as { marker?: string } | undefined;
    request.session.set('testMarker', body?.marker ?? 'persisted');
    await request.session.save();
    return reply.status(200).send({
      status: 'ok' as const,
      marker: request.session.get('testMarker'),
    });
  });

  app.get('/__test__/session', async (request, reply) => {
    return reply.status(200).send({
      status: 'ok' as const,
      marker: request.session.get('testMarker') ?? null,
    });
  });

  app.get('/__test__/auth-context', async (request, reply) => {
    return reply.status(200).send({
      status: 'ok' as const,
      sessionId: request.session.sessionId,
      userId: request.session.userId ?? null,
      tenantId: request.session.tenantId ?? null,
      role: request.session.role ?? null,
      createdAt: request.session.createdAt ?? null,
      lastAccess: request.session.lastAccess ?? null,
      ip: request.session.ip ?? null,
      userAgent: request.session.userAgent ?? null,
    });
  });

  app.delete('/__test__/session', async (request, reply) => {
    await request.session.destroy();
    return reply.status(200).send({ status: 'ok' as const });
  });
}
