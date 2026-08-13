import type { FastifyInstance } from 'fastify';

import {
  ApplicationError,
  type ApplicationErrorCode,
} from '../../shared/errors/application-error.js';

type ErrorResponse = {
  error: {
    code: ApplicationErrorCode;
    message: string;
    details?: ReadonlyArray<{ field: string; issue: string }>;
    requestId: string;
  };
};

/**
 * Erros de parsing de body JSON emitidos pelo Fastify (lib/errors.js).
 * Não mapear SyntaxError genérico — apenas códigos FST_ERR_CTP_* de cliente.
 */
const MALFORMED_JSON_BODY_ERROR_CODES = new Set([
  'FST_ERR_CTP_INVALID_JSON_BODY',
  'FST_ERR_CTP_EMPTY_JSON_BODY',
]);

function isMalformedJsonBodyError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && MALFORMED_JSON_BODY_ERROR_CODES.has(code);
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
    if (error instanceof ApplicationError) {
      if (error.code === 'INTERNAL_ERROR' || error.httpStatus >= 500) {
        request.log.error(
          {
            err: error,
            requestId: request.id,
            route: request.routeOptions.url,
            code: error.code,
          },
          'request_failed',
        );
      } else {
        request.log.info(
          {
            requestId: request.id,
            route: request.routeOptions.url,
            code: error.code,
          },
          'request_rejected',
        );
      }

      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          requestId: request.id,
        },
      };

      return reply.status(error.httpStatus).send(response);
    }

    if (isMalformedJsonBodyError(error)) {
      request.log.info(
        {
          requestId: request.id,
          route: request.routeOptions.url,
          code: 'VALIDATION_ERROR',
        },
        'request_rejected',
      );

      const response: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Requisição malformada.',
          requestId: request.id,
        },
      };

      return reply.status(400).send(response);
    }

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
