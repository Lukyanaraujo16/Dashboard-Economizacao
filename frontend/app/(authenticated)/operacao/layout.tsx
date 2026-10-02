'use client';

import { RequirePlatformRole } from '../../../src/auth/require-platform-role';

export default function OperacaoLayout({ children }: { readonly children: React.ReactNode }) {
  return <RequirePlatformRole>{children}</RequirePlatformRole>;
}
