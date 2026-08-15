import { BrandingDomainError } from './branding-domain-error.js';

/**
 * Chave fixa do singleton PlatformBranding (docs/17 §8.2, ADR-049).
 * Unique no banco impede múltiplos registros.
 */
export const PLATFORM_BRANDING_SINGLETON_KEY = 'default' as const;

/**
 * Normaliza o nome visual da plataforma: trim + colapso de espaços.
 * Obrigatório e não vazio. Sem slug.
 */
export function normalizePlatformBrandName(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    throw new BrandingDomainError(
      'PLATFORM_BRANDING_INVALID_NAME',
      'Nome da plataforma é obrigatório.',
    );
  }
  return collapsed;
}
