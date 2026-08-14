'use client';

import { RequirePlatformRole } from '../../../src/auth/require-platform-role';

type EmpresasLayoutProps = {
  readonly children: React.ReactNode;
};

export default function EmpresasLayout({ children }: EmpresasLayoutProps) {
  return <RequirePlatformRole>{children}</RequirePlatformRole>;
}
