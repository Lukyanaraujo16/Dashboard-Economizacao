import { RequireTenantSurface } from '../../../src/auth';
import { ReportsPage } from '../../../src/components/reports';

export default function RelatoriosPage() {
  return (
    <RequireTenantSurface>
      <ReportsPage />
    </RequireTenantSurface>
  );
}
