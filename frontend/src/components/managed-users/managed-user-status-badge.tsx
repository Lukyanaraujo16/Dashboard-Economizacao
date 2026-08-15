import type { ManagedUserStatus } from '../../services/admin/managed-user.types';
import { Badge } from '../ui';
import { managedUserStatusLabel } from './managed-user-utils';

type ManagedUserStatusBadgeProps = {
  readonly status: ManagedUserStatus;
};

export function ManagedUserStatusBadge({ status }: ManagedUserStatusBadgeProps) {
  const variant =
    status === 'ACTIVE'
      ? 'success'
      : status === 'BLOCKED'
        ? 'danger'
        : status === 'DISABLED'
          ? 'warning'
          : 'info';

  return (
    <Badge variant={variant} aria-label={`Status: ${managedUserStatusLabel(status)}`}>
      {managedUserStatusLabel(status)}
    </Badge>
  );
}
