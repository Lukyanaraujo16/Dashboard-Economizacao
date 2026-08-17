'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '../../src/auth';
import { LoginExperience } from '../../src/login/login-experience';
import { applyDocumentBranding, useRuntimePlatformBranding } from '../../src/theme';
import type { TenantBrandingInput } from '../../src/theme/types/theme';

/**
 * Rota de produção do login.
 * Usuário autenticado é redirecionado para `/` (destino temporário).
 * Branding vem de GET /branding/platform via RuntimePlatformBrandingProvider.
 */
export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();
  const { platformBranding, status: brandingStatus } = useRuntimePlatformBranding();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

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
  const branding: TenantBrandingInput | null = platformBranding
    ? {
        name: platformBranding.name,
        logoUrl: platformBranding.logoUrl,
        ...(platformBranding.light ? { light: platformBranding.light } : {}),
        ...(platformBranding.dark ? { dark: platformBranding.dark } : {}),
      }
    : null;

  return <LoginExperience brandName={brandName} brandLogoUrl={brandLogoUrl} branding={branding} />;
}
