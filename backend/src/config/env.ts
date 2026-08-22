import { parseIntegrationEncryptionKey } from '../infrastructure/crypto/secret-box.js';
import { parseAutoSyncIntervalMinutes } from '../modules/integrations/conta-azul/domain/conta-azul-sync.js';

const nodeEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof nodeEnvironments)[number];

export type StorageProvider = 'local';

export interface ContaAzulEnvironment {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Environment {
  allowInsecureHttpSession: boolean;
  authSecret: string;
  appUrl: string;
  contaAzul: ContaAzulEnvironment | null;
  databaseUrl: string | undefined;
  host: string;
  integrationEncryptionKey: Buffer | null;
  nodeEnv: NodeEnvironment;
  port: number;
  redisUrl: string;
  storagePath: string;
  storageProvider: StorageProvider;
  autoSyncIntervalMinutes: number;
}

const TEST_INTEGRATION_ENCRYPTION_KEY = '0'.repeat(64);
const TEST_APP_URL = 'http://127.0.0.1:3000';
const TEST_CONTA_AZUL: ContaAzulEnvironment = {
  clientId: 'test-conta-azul-client-id',
  clientSecret: 'test-conta-azul-client-secret',
  redirectUri: 'http://127.0.0.1:3000/integrations/conta-azul/callback',
};

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return nodeEnvironments.some((candidate) => candidate === value);
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const nodeEnv = value ?? 'development';

  if (!isNodeEnvironment(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }

  return nodeEnv;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3001');

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
  }

  return port;
}

function parseAuthSecret(value: string | undefined): string {
  const authSecret = value?.trim() ?? '';

  if (authSecret.length < 32) {
    throw new Error('AUTH_SECRET deve ter no mínimo 32 caracteres.');
  }

  return authSecret;
}

function parseRedisUrl(value: string | undefined): string {
  const redisUrl = value?.trim() ?? '';

  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL deve ser uma URL redis:// ou rediss:// válida.');
  }

  return redisUrl;
}

function parseStorageProvider(value: string | undefined): StorageProvider {
  const provider = (value ?? 'local').trim();
  if (provider !== 'local') {
    throw new Error('STORAGE_PROVIDER deve ser "local" no MVP.');
  }
  return provider;
}

function parseStoragePath(source: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment): string {
  if (nodeEnv === 'test') {
    const testPath = source.TEST_STORAGE_PATH?.trim() || source.STORAGE_PATH?.trim();
    if (!testPath) {
      throw new Error('TEST_STORAGE_PATH é obrigatória para testes.');
    }
    return testPath;
  }

  const configured = source.STORAGE_PATH?.trim();
  if (configured) {
    return configured;
  }

  if (nodeEnv === 'development') {
    return 'storage/dev';
  }

  throw new Error('STORAGE_PATH é obrigatória em produção.');
}

function parseAppUrl(value: string | undefined, nodeEnv: NodeEnvironment): string {
  const raw = value?.trim() || (nodeEnv === 'production' ? '' : TEST_APP_URL);
  if (!raw) {
    throw new Error('APP_URL é obrigatória em produção.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('APP_URL deve ser uma URL absoluta http ou https.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('APP_URL deve ser uma URL absoluta http ou https.');
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('APP_URL não deve conter caminho.');
  }

  return parsed.origin;
}

function parseContaAzul(
  source: NodeJS.ProcessEnv,
  nodeEnv: NodeEnvironment,
): ContaAzulEnvironment | null {
  const clientId = source.CONTA_AZUL_CLIENT_ID?.trim() ?? '';
  const clientSecret = source.CONTA_AZUL_CLIENT_SECRET?.trim() ?? '';
  const redirectUri = source.CONTA_AZUL_REDIRECT_URI?.trim() ?? '';

  if (!clientId && !clientSecret && !redirectUri) {
    return nodeEnv === 'test' ? TEST_CONTA_AZUL : null;
  }

  if (!clientId || !clientSecret || !redirectUri) {
    if (nodeEnv === 'development') {
      return null;
    }
    throw new Error(
      'CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REDIRECT_URI devem ser definidos juntos.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error('CONTA_AZUL_REDIRECT_URI deve ser uma URL absoluta http ou https.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('CONTA_AZUL_REDIRECT_URI deve ser uma URL absoluta http ou https.');
  }

  if (parsed.pathname !== '/integrations/conta-azul/callback') {
    throw new Error('CONTA_AZUL_REDIRECT_URI deve terminar em /integrations/conta-azul/callback.');
  }

  return { clientId, clientSecret, redirectUri };
}

function parseBooleanFlag(value: string | undefined): boolean {
  const raw = value?.trim().toLowerCase() ?? '';
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * Cookie Secure em production quebra login em HTTP puro (piloto por IP).
 * A flag só vale em production + APP_URL http://. HTTPS ignora/recusa.
 * Fora de production o cookie já não é Secure — a flag não altera nada.
 */
export function resolveAllowInsecureHttpSession(input: {
  readonly flag: string | undefined;
  readonly nodeEnv: NodeEnvironment;
  readonly appUrl: string;
}): boolean {
  if (!parseBooleanFlag(input.flag)) {
    return false;
  }

  if (input.nodeEnv !== 'production') {
    return false;
  }

  let protocol: string;
  try {
    protocol = new URL(input.appUrl).protocol;
  } catch {
    return false;
  }

  if (protocol === 'https:') {
    return false;
  }

  return protocol === 'http:';
}

function parseEncryptionKey(value: string | undefined, nodeEnv: NodeEnvironment): Buffer | null {
  const raw = value?.trim() ?? '';
  if (!raw) {
    if (nodeEnv === 'test') {
      return parseIntegrationEncryptionKey(TEST_INTEGRATION_ENCRYPTION_KEY);
    }
    if (nodeEnv === 'production') {
      throw new Error('INTEGRATION_ENCRYPTION_KEY é obrigatória em produção.');
    }
    return null;
  }
  return parseIntegrationEncryptionKey(raw);
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const nodeEnv = parseNodeEnvironment(source.NODE_ENV);
  const appUrl = parseAppUrl(source.APP_URL, nodeEnv);
  return {
    allowInsecureHttpSession: resolveAllowInsecureHttpSession({
      flag: source.ALLOW_INSECURE_HTTP_SESSION,
      nodeEnv,
      appUrl,
    }),
    authSecret: parseAuthSecret(source.AUTH_SECRET),
    appUrl,
    contaAzul: parseContaAzul(source, nodeEnv),
    databaseUrl: source.DATABASE_URL,
    host: source.HOST ?? '127.0.0.1',
    integrationEncryptionKey: parseEncryptionKey(source.INTEGRATION_ENCRYPTION_KEY, nodeEnv),
    nodeEnv,
    port: parsePort(source.PORT),
    redisUrl: parseRedisUrl(source.REDIS_URL),
    storagePath: parseStoragePath(source, nodeEnv),
    storageProvider: parseStorageProvider(source.STORAGE_PROVIDER),
    autoSyncIntervalMinutes: parseAutoSyncIntervalMinutes(
      source.CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES,
    ),
  };
}
