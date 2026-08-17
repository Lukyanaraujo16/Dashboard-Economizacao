'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { getPublicPlatformBranding } from '../../services/branding/current';
import type { CurrentBranding } from '../../services/branding/current.types';
import {
  RuntimePlatformBrandingContext,
  type RuntimePlatformBrandingStatus,
} from './runtime-platform-branding-context';

type RuntimePlatformBrandingProviderProps = {
  readonly children: ReactNode;
  /** Injeção para testes. */
  readonly getPublicPlatformBrandingAction?: typeof getPublicPlatformBranding;
};

/**
 * Carrega GET /branding/platform no bootstrap (login sem sessão).
 * Cache apenas em memória; refresh recarrega o endpoint público.
 */
export function RuntimePlatformBrandingProvider({
  children,
  getPublicPlatformBrandingAction = getPublicPlatformBranding,
}: RuntimePlatformBrandingProviderProps) {
  const [platformBranding, setPlatformBranding] = useState<CurrentBranding | null>(null);
  const [status, setStatus] = useState<RuntimePlatformBrandingStatus>('loading');
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');

    try {
      const next = await getPublicPlatformBrandingAction();
      if (requestId !== requestIdRef.current) {
        return;
      }
      setPlatformBranding(next);
      setStatus('ready');
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setPlatformBranding(null);
      setStatus('error');
    }
  }, [getPublicPlatformBrandingAction]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return (
    <RuntimePlatformBrandingContext.Provider value={{ platformBranding, status, refresh }}>
      {children}
    </RuntimePlatformBrandingContext.Provider>
  );
}
