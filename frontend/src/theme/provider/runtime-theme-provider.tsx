'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../../auth';
import { getCurrentBranding } from '../../services/branding/current';
import type { CurrentBranding } from '../../services/branding/current.types';
import { ThemeProvider } from '../../theme/index';
import type { TenantBrandingInput } from '../../theme/types/theme';

type RuntimeThemeProviderProps = {
  readonly children: ReactNode;
  /** Injeção para testes. */
  readonly getCurrentBrandingAction?: typeof getCurrentBranding;
};

function sessionKey(userId: string, tenantId: string | null): string {
  return `${userId}:${tenantId ?? 'platform'}`;
}

function toTenantBrandingInput(current: CurrentBranding): TenantBrandingInput {
  return {
    name: current.name,
    logoUrl: current.logoUrl,
    ...(current.light ? { light: current.light } : {}),
    ...(current.dark ? { dark: current.dark } : {}),
  };
}

/**
 * Carrega GET /branding/current após autenticação e alimenta o ThemeProvider.
 * Falha → fallback de plataforma (branding null). Não desloga por erro de branding.
 * Estado só em memória; limpa no logout / troca de sessão.
 */
export function RuntimeThemeProvider({
  children,
  getCurrentBrandingAction = getCurrentBranding,
}: RuntimeThemeProviderProps) {
  const { status, user } = useAuth();
  const [branding, setBranding] = useState<TenantBrandingInput | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      activeKeyRef.current = null;
      setBranding(null);
      return;
    }

    const key = sessionKey(user.id, user.tenantId);
    activeKeyRef.current = key;
    setBranding(null);

    let cancelled = false;

    void (async () => {
      try {
        const current = await getCurrentBrandingAction();
        if (cancelled || activeKeyRef.current !== key) {
          return;
        }
        setBranding(toTenantBrandingInput(current));
      } catch {
        if (cancelled || activeKeyRef.current !== key) {
          return;
        }
        // Auth permanece autoridade; branding é enhancement visual.
        setBranding(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user, getCurrentBrandingAction]);

  return <ThemeProvider branding={branding}>{children}</ThemeProvider>;
}
