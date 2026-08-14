import type { CompanyStatus } from '../../services/admin/companies.types';
import { Badge } from '../ui';
import { companyStatusLabel } from './company-utils';

type CompanyStatusBadgeProps = {
  readonly status: CompanyStatus;
};

export function CompanyStatusBadge({ status }: CompanyStatusBadgeProps) {
  const variant = status === 'ACTIVE' ? 'success' : 'warning';
  return (
    <Badge variant={variant} aria-label={`Status: ${companyStatusLabel(status)}`}>
      {companyStatusLabel(status)}
    </Badge>
  );
}
