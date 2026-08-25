'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { isPlatformRole, useAuth } from '../../auth';
import { getPlatformBranding } from '../../services/admin/platform-branding';
import type { PlatformBranding } from '../../services/admin/platform-branding.types';
import { DEFAULT_PLATFORM_BRAND_NAME } from '../../services/admin/platform-branding.types';
import { getCurrentBranding } from '../../services/branding/current';
import type { CurrentBranding } from '../../services/branding/current.types';
import { ThemeProvider } from './theme-provider';
import type { TenantBrandingInput } from '../../theme/types/theme';
import { applyDocumentBranding } from '../runtime/apply-document-branding';
import { RuntimeThemeContext } from './runtime-theme-context';

type RuntimeThemeProviderProps = {
  readonly children: ReactNode;
  /** Injeção para testes (USER / sessão). */
  readonly getCurrentBrandingAction?: typeof getCurrentBranding;
  /** Injeção para testes (ADMIN / SUPER_ADMIN). */
  readonly getPlatformBrandingAction?: typeof getPlatformBranding;
};

type SessionBrandingState = {
  readonly branding: TenantBrandingInput | null;
  readonly faviconUrl: string | null;
  readonly documentName: string | null;
  readonly updatedAt: string | null;
};

const EMPTY_BRANDING: SessionBrandingState = {
  branding: null,
  faviconUrl: null,
  documentName: null,
  updatedAt: null,
};

export function runtimeBrandingSessionKey(
  userId: string,
  tenantId: string | null,
  supportTenantId: string | null,
): string {
  return `${userId}:${tenantId ?? 'platform'}:support-${supportTenantId ?? 'inactive'}`;
}

function toTenantBrandingInput(current: CurrentBranding): TenantBrandingInput {
  return {
    name: current.name,
    logoUrl: current.logoUrl,
    iconUrl: current.iconUrl,
    ...(current.light ? { light: current.light } : {}),
    ...(current.dark ? { dark: current.dark } : {}),
  };
}

function platformToSessionState(platform: PlatformBranding): SessionBrandingState {
  const name = platform.name?.trim() || DEFAULT_PLATFORM_BRAND_NAME;
  return {
    branding: {
      name,
      logoUrl: platform.logoUrl,
      iconUrl: platform.iconUrl,
      ...(platform.light ? { light: platform.light } : {}),
      ...(platform.dark ? { dark: platform.dark } : {}),
    },
    faviconUrl: platform.faviconUrl,
    documentName: name,
    updatedAt: platform.updatedAt,
  };
}

function currentToSessionState(current: CurrentBranding): SessionBrandingState {
  return {
    branding: toTenantBrandingInput(current),
    faviconUrl: current.faviconUrl,
    documentName: current.name,
    updatedAt: current.updatedAt,
  };
}

/**
 * Carrega branding da sessão após autenticação e alimenta o ThemeProvider.
 * ADMIN/SUPER_ADMIN → GET /admin/platform/branding.
 * USER → GET /branding/current (tenant + fallback plataforma no backend).
 * Falha → Theme Default (branding null). Não desloga por erro de branding.
 * Estado só em memória; limpa no logout / troca de sessão.
 */
export function RuntimeThemeProvider({
  children,
  getCurrentBrandingAction = getCurrentBranding,
  getPlatformBrandingAction = getPlatformBranding,
}: RuntimeThemeProviderProps) {
  const { status, user, support } = useAuth();
  const [session, setSession] = useState<SessionBrandingState>(EMPTY_BRANDING);
  const activeKeyRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);

  const applySession = useCallback((next: SessionBrandingState) => {
    setSession(next);
    applyDocumentBranding({
      name: next.documentName,
      faviconUrl: next.faviconUrl,
      updatedAt: next.updatedAt,
    });
  }, []);

  const clearSession = useCallback(() => {
    setSession(EMPTY_BRANDING);
    applyDocumentBranding({ name: null, faviconUrl: null, updatedAt: null });
  }, []);

  const loadForUser = useCallback(
    async (key: string, role: NonNullable<typeof user>['role'], supportActive: boolean) => {
      const loadId = ++loadIdRef.current;
      try {
        const next =
          isPlatformRole(role) && !supportActive
            ? platformToSessionState(await getPlatformBrandingAction())
            : currentToSessionState(await getCurrentBrandingAction());

        if (loadId !== loadIdRef.current || activeKeyRef.current !== key) {
          return;
        }
        applySession(next);
      } catch {
        if (loadId !== loadIdRef.current || activeKeyRef.current !== key) {
          return;
        }
        // Auth permanece autoridade; branding é enhancement visual.
        applySession(EMPTY_BRANDING);
      }
    },
    [applySession, getCurrentBrandingAction, getPlatformBrandingAction],
  );

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      activeKeyRef.current = null;
      loadIdRef.current += 1;
      clearSession();
      return;
    }

    const supportTenantId = support.active ? support.tenantId : null;
    const key = runtimeBrandingSessionKey(user.id, user.tenantId, supportTenantId);
    activeKeyRef.current = key;
    setSession(EMPTY_BRANDING);

    void loadForUser(key, user.role, support.active);
  }, [
    status,
    user?.id,
    user?.tenantId,
    user?.role,
    support.active,
    support.active ? support.tenantId : null,
    clearSession,
    loadForUser,
  ]);

  const refreshBranding = useCallback(async () => {
    if (status !== 'authenticated' || !user) {
      return;
    }
    const key = runtimeBrandingSessionKey(
      user.id,
      user.tenantId,
      support.active ? support.tenantId : null,
    );
    activeKeyRef.current = key;
    await loadForUser(key, user.role, support.active);
  }, [status, user, support, loadForUser]);

  return (
    <RuntimeThemeContext.Provider value={{ refreshBranding, clearBranding: clearSession }}>
      <ThemeProvider branding={session.branding}>{children}</ThemeProvider>
    </RuntimeThemeContext.Provider>
  );
}
