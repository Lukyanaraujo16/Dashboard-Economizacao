import type { FinancialSectionProps } from '../financial';
import { FinancialSection } from '../financial';

export type DashboardSectionProps = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: FinancialSectionProps['children'];
  readonly className?: string;
};

/** @deprecated Preferir `FinancialSection` de `components/financial`. */
export function DashboardSection({
  id,
  title,
  description,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <FinancialSection id={id} title={title} subtitle={description} className={className}>
      {children}
    </FinancialSection>
  );
}
