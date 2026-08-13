import type { ColorTokens } from '../types/colors';
import type { TenantBrandingInput } from '../types/theme';
import { isAllowedBrandingColorToken } from './allowed-color-overrides';

function sanitizeColorPartial(
  partial: Partial<ColorTokens> | undefined,
): Partial<ColorTokens> | undefined {
  if (!partial) {
    return undefined;
  }

  const next: Record<string, string> = {};
  let hasValue = false;

  for (const [key, value] of Object.entries(partial)) {
    if (!isAllowedBrandingColorToken(key)) {
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    next[key] = value.trim();
    hasValue = true;
  }

  return hasValue ? (next as Partial<ColorTokens>) : undefined;
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normaliza input de branding para o Theme Engine.
 * Vazio / inválido → null (fallback para Theme Default).
 * Sem fetch, sem persistência.
 */
export function normalizeBrandingInput(
  branding: TenantBrandingInput | null | undefined,
): TenantBrandingInput | null {
  if (!branding) {
    return null;
  }

  const name = sanitizeOptionalText(branding.name);
  const logoUrl = sanitizeOptionalText(branding.logoUrl ?? undefined);
  const light = sanitizeColorPartial(branding.light);
  const dark = sanitizeColorPartial(branding.dark);

  if (!name && !logoUrl && !light && !dark) {
    return null;
  }

  return {
    ...(name ? { name } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
  };
}
