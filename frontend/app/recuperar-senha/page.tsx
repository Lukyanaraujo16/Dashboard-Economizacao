'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { resolveAuthenticatedHomePath, useAuth } from '../../src/auth';
import { PasswordRecoveryExperience } from '../../src/login/password-recovery-experience';
import { applyDocumentBranding, useRuntimePlatformBranding } from '../../src/theme';
import type { TenantBrandingInput } from '../../src/theme/types/theme';

/**
 * AUTH-004 V1: recuperação assistida. Não consulta cadastro.
 */
export default function PasswordRecoveryPage() {
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
    <PasswordRecoveryExperience
      brandName={platformBranding?.name?.trim() || undefined}
      brandLogoUrl={platformBranding?.logoUrl ?? null}
      brandIconUrl={platformBranding?.iconUrl ?? null}
      branding={branding}
    />
  );
}
