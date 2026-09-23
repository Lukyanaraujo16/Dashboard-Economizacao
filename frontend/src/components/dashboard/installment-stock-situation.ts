export type InstallmentStockSituation = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export function formatInstallmentStockSituation(
  situation: InstallmentStockSituation,
  overdueDays: number | null,
): string {
  if (situation === 'DUE_TODAY') {
    return 'Vence hoje';
  }
  if (situation === 'UPCOMING') {
    return 'A vencer';
  }
  if (overdueDays === 1) {
    return 'Vencido há 1 dia';
  }
  if (overdueDays !== null && overdueDays > 1) {
    return `Vencido há ${overdueDays} dias`;
  }
  return 'Vencido';
}
