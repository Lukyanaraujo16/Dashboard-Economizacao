const TENANT_ASSET_KEY_PATTERN =
  /^tenants\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/branding\/(?:icon\/)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i;

const PLATFORM_ASSET_KEY_PATTERN =
  /^platform\/branding\/(logo|favicon|icon)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i;

export function isSafeStorageKey(storageKey: string): boolean {
  if (storageKey.includes('\0') || storageKey.includes('..') || storageKey.startsWith('/')) {
    return false;
  }
  return TENANT_ASSET_KEY_PATTERN.test(storageKey) || PLATFORM_ASSET_KEY_PATTERN.test(storageKey);
}

export function assertSafeStorageKey(storageKey: string): void {
  if (!isSafeStorageKey(storageKey)) {
    throw new Error('storageKey inválida.');
  }
}
