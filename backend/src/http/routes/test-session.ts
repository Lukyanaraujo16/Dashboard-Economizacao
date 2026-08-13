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

  app.delete('/__test__/session', async (request, reply) => {
    await request.session.destroy();
    return reply.status(200).send({ status: 'ok' as const });
  });
}
