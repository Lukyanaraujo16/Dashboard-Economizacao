import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

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
    loadEnvFile(explicit);
    return;
  }

  const rootEnvPath = resolve(process.cwd(), '../.env');
  const localEnvPath = resolve(process.cwd(), '.env');
  if (existsSync(rootEnvPath)) {
    loadEnvFile(rootEnvPath);
    return;
  }
  if (existsSync(localEnvPath)) {
    loadEnvFile(localEnvPath);
  }
}
