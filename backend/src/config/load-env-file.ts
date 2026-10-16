import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

/**
 * `loadEnvFile` não sobrescreve variáveis já definidas no processo.
 * Túnel Cloudflare / OAuth mudam de hostname: o .env local deve prevalecer.
 */
const FILE_WINS_KEYS = ['APP_URL', 'CONTA_AZUL_REDIRECT_URI'] as const;

function applyFileWinningKeys(path: string): void {
  const contents = readFileSync(path, 'utf8');
  for (const key of FILE_WINS_KEYS) {
    const value = readEnvFileValue(contents, key);
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

function readEnvFileValue(contents: string, key: string): string | undefined {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(contents);
  if (!match) {
    return undefined;
  }
  let value = (match[1] ?? '').trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadEnvFileWithLocalUrls(path: string): void {
  loadEnvFile(path);
  applyFileWinningKeys(path);
}

/**
 * Carrega o arquivo de ambiente do processo.
 * 1. DASHBOARD_ENV_FILE (systemd/ops)
 * 2. ../.env relativo ao cwd (monorepo: backend/ → raiz)
 * 3. .env no cwd
 */
export function loadRootEnvFile(): void {
  const explicit = process.env.DASHBOARD_ENV_FILE?.trim();
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`DASHBOARD_ENV_FILE não encontrado: ${explicit}`);
    }
    loadEnvFileWithLocalUrls(explicit);
    return;
  }

  const rootEnvPath = resolve(process.cwd(), '../.env');
  const localEnvPath = resolve(process.cwd(), '.env');
  if (existsSync(rootEnvPath)) {
    loadEnvFileWithLocalUrls(rootEnvPath);
    return;
  }
  if (existsSync(localEnvPath)) {
    loadEnvFileWithLocalUrls(localEnvPath);
  }
}
