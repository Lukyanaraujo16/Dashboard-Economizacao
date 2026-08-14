import type { ChartCardProps } from '../financial';
import { ChartCard } from '../financial';

export type EmptyPanelProps = {
  readonly description: string;
  readonly title?: string;
  readonly className?: string;
  readonly minHeight?: ChartCardProps['size'];
  readonly icon?: ChartCardProps['icon'];
};

/** @deprecated Preferir `ChartCard` de `components/financial`. */
export function EmptyPanel({
  description,
  title,
  className,
  minHeight = 'default',
  icon,
}: EmptyPanelProps) {
  return (
    <ChartCard
      state="empty"
      size={minHeight}
      icon={icon}
      title={title}
      emptyMessage={description}
      className={className}
    />
  );
}
