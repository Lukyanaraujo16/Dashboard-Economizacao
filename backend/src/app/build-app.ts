import Fastify, { type FastifyInstance } from 'fastify';

import { loadEnvironment } from '../config/env.js';
import { registerErrorHandlers } from '../http/errors/register-error-handlers.js';
import { registerRoutes } from './register-routes.js';

const redactedLogPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'client_secret',
  'apiKey',
];

export function buildApp(): FastifyInstance {
  const environment = loadEnvironment();
  const app = Fastify({
    logger:
      environment.nodeEnv === 'test'
        ? false
        : {
            level: environment.nodeEnv === 'production' ? 'info' : 'debug',
            redact: {
              paths: redactedLogPaths,
              censor: '[REDACTED]',
            },
          },
  });

  registerErrorHandlers(app);
  void app.register(registerRoutes);

  return app;
}
