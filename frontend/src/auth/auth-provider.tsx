'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { logout as logoutRequest } from '../services/auth/logout';
import { getCurrentUser, SessionRequestError } from '../services/auth/me';
import type { AuthMeResponse, AuthenticatedUser, AuthStatus, SupportState } from './types';

export type RefreshSessionResult =
  | { readonly kind: 'authenticated'; readonly user: AuthenticatedUser; readonly support: SupportState }
  | { readonly kind: 'unauthenticated' };

export type AuthContextValue = {
  readonly status: AuthStatus;
  readonly user: AuthenticatedUser | null;
  readonly support: SupportState;
  readonly refreshSession: () => Promise<RefreshSessionResult>;
  /** Aplica resposta de enter/exit sem segundo round-trip. */
  readonly applySession: (session: AuthMeResponse) => void;
  readonly logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const INACTIVE_SUPPORT: SupportState = { active: false };

type AuthProviderProps = {
  readonly children: ReactNode;
  /** Injeção para testes. */
  readonly getCurrentUserAction?: typeof getCurrentUser;
  readonly logoutAction?: typeof logoutRequest;
  /** Quando false, não hidrata automaticamente (testes unitários pontuais). */
  readonly hydrateOnMount?: boolean;
};

/**
 * Hidratação mínima de sessão (1.1F-E.3).
 * Cookie HttpOnly; sem JWT/storage; fonte de verdade = GET /auth/me.
 */
export function AuthProvider({
  children,
  getCurrentUserAction = getCurrentUser,
  logoutAction = logoutRequest,
  hydrateOnMount = true,
}: AuthProviderProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>(hydrateOnMount ? 'loading' : 'unauthenticated');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [support, setSupport] = useState<SupportState>(INACTIVE_SUPPORT);
  const requestIdRef = useRef(0);

  const refreshSession = useCallback(async (): Promise<RefreshSessionResult> => {
    const requestId = ++requestIdRef.current;
    try {
      const result = await getCurrentUserAction();
      if (requestId !== requestIdRef.current) {
        return result.kind === 'authenticated'
          ? { kind: 'authenticated', user: result.user, support: result.support }
          : { kind: 'unauthenticated' };
      }
      if (result.kind === 'authenticated') {
        setUser(result.user);
        setSupport(result.support);
        setStatus('authenticated');
        return { kind: 'authenticated', user: result.user, support: result.support };
      }
      setUser(null);
      setSupport(INACTIVE_SUPPORT);
      setStatus('unauthenticated');
      return { kind: 'unauthenticated' };
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setUser(null);
        setSupport(INACTIVE_SUPPORT);
        setStatus('error');
      }
      if (error instanceof SessionRequestError) {
        throw error;
      }
      throw new SessionRequestError('Não foi possível verificar a sessão. Tente novamente.', {
        cause: error,
      });
    }
  }, [getCurrentUserAction]);

  const applySession = useCallback((session: AuthMeResponse) => {
    setUser(session.user);
    setSupport(session.support);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutAction();
    setUser(null);
    setSupport(INACTIVE_SUPPORT);
    setStatus('unauthenticated');
    router.replace('/login');
  }, [logoutAction, router]);

  useEffect(() => {
    if (!hydrateOnMount) {
      return;
    }
    void refreshSession().catch(() => {
      // Estado `error` já definido em refreshSession.
    });
  }, [hydrateOnMount, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      support,
      refreshSession,
      applySession,
      logout,
    }),
    [status, user, support, refreshSession, applySession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return value;
}
