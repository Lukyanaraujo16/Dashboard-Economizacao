'use client';

import { RequirePlatformRole } from '../../../src/auth/require-platform-role';

type AdministradoresLayoutProps = {
  readonly children: React.ReactNode;
};

export default function AdministradoresLayout({ children }: AdministradoresLayoutProps) {
  return <RequirePlatformRole>{children}</RequirePlatformRole>;
}
