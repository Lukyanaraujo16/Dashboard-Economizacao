import type { KpiCardProps } from '../financial';
import { KpiCard } from '../financial';

export type DashboardCardProps = {
  readonly title: string;
  readonly emptyDescription?: string;
  readonly className?: string;
} & Pick<KpiCardProps, 'state' | 'value' | 'meta' | 'loadingLabel' | 'errorMessage' | 'onRetry'>;

/** @deprecated Preferir `KpiCard` de `components/financial`. */
export function DashboardCard({
  title,
  emptyDescription,
  className,
  state = 'empty',
  ...rest
}: DashboardCardProps) {
  return (
    <KpiCard
      title={title}
      state={state}
      emptyMessage={emptyDescription}
      className={className}
      {...rest}
    />
  );
}
