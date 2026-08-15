import path from 'node:path';
import { rm } from 'node:fs/promises';

function isDangerousStorageRoot(resolved: string): boolean {
  const root = path.parse(resolved).root;
  return resolved === root || resolved === '/' || resolved === path.resolve('~');
}

export function assertTestStoragePath(storagePath: string): void {
  const resolved = path.resolve(storagePath);
  if (isDangerousStorageRoot(resolved)) {
    throw new Error('Operação de teste bloqueada: diretório de storage perigoso.');
  }

  const base = path.basename(resolved);
  if (!base.endsWith('_test') && !resolved.includes(`${path.sep}storage_test`)) {
    throw new Error(
      `Operação de teste bloqueada: o storage "${resolved}" deve terminar em "_test".`,
    );
  }
}

export function resolveTestStoragePath(source: NodeJS.ProcessEnv = process.env): string {
  const configured = source.TEST_STORAGE_PATH?.trim();
  if (configured) {
    assertTestStoragePath(configured);
    return path.resolve(configured);
  }

  const fallback = path.resolve(process.cwd(), '../storage/storage_test');
  assertTestStoragePath(fallback);
  return fallback;
}

export async function cleanTestStorage(
  storagePath: string = process.env.TEST_STORAGE_PATH ?? process.env.STORAGE_PATH ?? '',
): Promise<void> {
  if (!storagePath) {
    throw new Error('TEST_STORAGE_PATH de teste não está configurada para o cleanup.');
  }
  assertTestStoragePath(storagePath);
  await rm(path.resolve(storagePath), { recursive: true, force: true });
}
