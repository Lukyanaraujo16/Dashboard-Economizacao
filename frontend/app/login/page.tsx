'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '../../src/auth';
import { LoginExperience } from '../../src/login/login-experience';

/**
 * Rota de produção do login.
 * Usuário autenticado é redirecionado para `/` (destino temporário).
 */
export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') {
    return null;
  }

  return <LoginExperience />;
}
