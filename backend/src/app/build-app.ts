import Fastify, { type FastifyInstance } from 'fastify';

import { loadEnvironment } from '../config/env.js';
import { resolveTrustProxy } from '../config/trust-proxy.js';
import { registerErrorHandlers } from '../http/errors/register-error-handlers.js';
import { sanitizeLoggedRequestUrl } from '../http/sanitize-logged-request-url.js';
import { registerAuthFoundation } from '../modules/auth/index.js';
import { registerRoutes } from './register-routes.js';

const redactedLogPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'encryptedAccessToken',
  'encryptedRefreshToken',
  'client_secret',
  'clientSecret',
  'apiKey',
  'authSecret',
  'req.query.code',
];

export async function buildApp(): Promise<FastifyInstance> {
  const environment = loadEnvironment();
  const trustProxy = resolveTrustProxy(environment.host);
  const app = Fastify({
    trustProxy: trustProxy === false ? false : [...trustProxy],
    logger:
      environment.nodeEnv === 'test'
        ? false
        : {
            level: environment.nodeEnv === 'production' ? 'info' : 'debug',
            redact: {
              paths: redactedLogPaths,
              censor: '[REDACTED]',
            },
            serializers: {
              req(request: {
                method?: string;
                url?: string;
                hostname?: string;
                ip?: string;
                socket?: { remotePort?: number };
              }) {
                return {
                  method: request.method,
                  url: sanitizeLoggedRequestUrl(request.url ?? ''),
                  hostname: request.hostname,
                  remoteAddress: request.ip,
                  remotePort: request.socket?.remotePort,
                };
              },
            },
          },
  });

  if (environment.allowInsecureHttpSession) {
    app.log.warn(
      'allow_insecure_http_session_enabled: cookie de sessão sem Secure. Use apenas no modo IP temporário HTTP. Configure HTTPS e desative ALLOW_INSECURE_HTTP_SESSION.',
    );
  }

  registerErrorHandlers(app);
  await registerAuthFoundation(app, environment);
  await app.register(registerRoutes);

  return app;
}
