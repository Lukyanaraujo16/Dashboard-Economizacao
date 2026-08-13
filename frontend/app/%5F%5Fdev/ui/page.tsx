import { notFound } from 'next/navigation';

import { DevUiPlayground } from '../../../src/dev/dev-ui-playground';
import { isDevUiEnabled } from '../../../src/dev/is-dev-ui-enabled';

export default function DevUiPage() {
  if (!isDevUiEnabled()) {
    notFound();
  }

  return <DevUiPlayground />;
}
