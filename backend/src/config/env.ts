const nodeEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface Environment {
  databaseUrl: string | undefined;
  host: string;
  nodeEnv: NodeEnvironment;
  port: number;
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

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return {
    databaseUrl: source.DATABASE_URL,
    host: source.HOST ?? '127.0.0.1',
    nodeEnv: parseNodeEnvironment(source.NODE_ENV),
    port: parsePort(source.PORT),
  };
}
