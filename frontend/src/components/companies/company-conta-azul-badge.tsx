import type { CompanyContaAzulStatus } from '../../services/admin/companies.types';
import { Badge } from '../ui';

type CompanyContaAzulBadgeProps = {
  readonly status: CompanyContaAzulStatus | null;
};

function contaAzulStatusPresentation(status: CompanyContaAzulStatus | null): {
  readonly label: string;
  readonly variant: 'neutral' | 'success' | 'warning';
} {
  if (status === 'CONNECTED') {
    return { label: 'Conectada', variant: 'success' };
  }
  if (status === 'ERROR') {
    return { label: 'Atenção necessária', variant: 'warning' };
  }
  if (status === 'DISCONNECTED') {
    return { label: 'Não conectada', variant: 'neutral' };
  }
  return { label: 'Não configurada', variant: 'neutral' };
}

export function CompanyContaAzulBadge({ status }: CompanyContaAzulBadgeProps) {
  const { label, variant } = contaAzulStatusPresentation(status);
  return (
    <Badge variant={variant} aria-label={`Conta Azul: ${label}`}>
      {label}
    </Badge>
  );
}
