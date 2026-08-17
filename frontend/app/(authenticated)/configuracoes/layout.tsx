'use client';

import { RequirePlatformRole } from '../../../src/auth/require-platform-role';

type ConfiguracoesLayoutProps = {
  readonly children: React.ReactNode;
};

export default function ConfiguracoesLayout({ children }: ConfiguracoesLayoutProps) {
  return <RequirePlatformRole>{children}</RequirePlatformRole>;
}
