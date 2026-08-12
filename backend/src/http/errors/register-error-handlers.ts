import type { FastifyInstance } from 'fastify';

interface ErrorResponse {
  error: {
    code: 'INTERNAL_ERROR' | 'NOT_FOUND';
    message: string;
    requestId: string;
  };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'Rota não encontrada.',
        requestId: request.id,
      },
    };

    return reply.status(404).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        err: error,
        requestId: request.id,
        route: request.routeOptions.url,
      },
      'request_failed',
    );

    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a operação. Tente novamente.',
        requestId: request.id,
      },
    };

    return reply.status(500).send(response);
  });
}
