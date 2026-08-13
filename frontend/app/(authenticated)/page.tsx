'use client';

import { AuthenticatedHome } from '../../src/components/layout';

/** Home autenticada temporária em `/` — sem dashboard financeiro. */
export default function AuthenticatedHomePage() {
  return <AuthenticatedHome />;
}
