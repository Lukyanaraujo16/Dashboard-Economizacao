'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { resolveAuthenticatedHomePath, useAuth } from '../../src/auth';
import { LoginExperience } from '../../src/login/login-experience';
import { applyDocumentBranding, useRuntimePlatformBranding } from '../../src/theme';
import type { TenantBrandingInput } from '../../src/theme/types/theme';

/**
 * Rota de produção do login.
 * USER autenticado → `/`. ADMIN/SUPER_ADMIN sem Support Mode → `/empresas`.
 * Branding vem de GET /branding/platform via RuntimePlatformBrandingProvider.
 */
export default function LoginPage() {
  const router = useRouter();
  const { status, user, support } = useAuth();
  const { platformBranding, status: brandingStatus } = useRuntimePlatformBranding();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(resolveAuthenticatedHomePath(user, support));
    }
  }, [status, user, support, router]);

  useEffect(() => {
    if (brandingStatus === 'loading') {
      return;
    }
    applyDocumentBranding({
      name: platformBranding?.name ?? null,
      faviconUrl: platformBranding?.faviconUrl ?? null,
      updatedAt: platformBranding?.updatedAt ?? null,
    });
  }, [platformBranding, brandingStatus]);

  if (status === 'loading' || status === 'authenticated') {
    return null;
  }

  const brandName = platformBranding?.name?.trim() || undefined;
  const brandLogoUrl = platformBranding?.logoUrl ?? null;
  const brandIconUrl = platformBranding?.iconUrl ?? null;
  const branding: TenantBrandingInput | null = platformBranding
    ? {
        name: platformBranding.name,
        logoUrl: platformBranding.logoUrl,
        iconUrl: platformBranding.iconUrl,
        ...(platformBranding.light ? { light: platformBranding.light } : {}),
        ...(platformBranding.dark ? { dark: platformBranding.dark } : {}),
      }
    : null;

  return (
    <LoginExperience
      brandName={brandName}
      brandLogoUrl={brandLogoUrl}
      brandIconUrl={brandIconUrl}
      branding={branding}
    />
  );
}
