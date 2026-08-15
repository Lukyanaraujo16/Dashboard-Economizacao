const nodeEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof nodeEnvironments)[number];

export type StorageProvider = 'local';

export interface Environment {
  authSecret: string;
  databaseUrl: string | undefined;
  host: string;
  nodeEnv: NodeEnvironment;
  port: number;
  redisUrl: string;
  storagePath: string;
  storageProvider: StorageProvider;
}

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

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const nodeEnv = parseNodeEnvironment(source.NODE_ENV);
  return {
    authSecret: parseAuthSecret(source.AUTH_SECRET),
    databaseUrl: source.DATABASE_URL,
    host: source.HOST ?? '127.0.0.1',
    nodeEnv,
    port: parsePort(source.PORT),
    redisUrl: parseRedisUrl(source.REDIS_URL),
    storagePath: parseStoragePath(source, nodeEnv),
    storageProvider: parseStorageProvider(source.STORAGE_PROVIDER),
  };
}
