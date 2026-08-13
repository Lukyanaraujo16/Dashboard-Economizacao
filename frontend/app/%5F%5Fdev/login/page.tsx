import { notFound } from 'next/navigation';

import { isDevUiEnabled } from '../../../src/dev/is-dev-ui-enabled';
import { LoginExperience } from '../../../src/login/login-experience';

export default function DevLoginPage() {
  if (!isDevUiEnabled()) {
    notFound();
  }

  return <LoginExperience showThemeControls />;
}
