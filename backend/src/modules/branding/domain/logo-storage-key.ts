import { randomUUID } from 'node:crypto';

import type { AllowedLogoMimeType } from './logo-mime.js';
import { extensionForLogoMimeType } from './logo-mime.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createTenantLogoStorageKey(
  tenantId: string,
  mimeType: AllowedLogoMimeType,
): string {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error('tenantId inválido para storageKey.');
  }

  return `tenants/${tenantId.toLowerCase()}/branding/${randomUUID()}.${extensionForLogoMimeType(mimeType)}`;
}
