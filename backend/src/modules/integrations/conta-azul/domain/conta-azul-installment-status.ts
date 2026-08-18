import type { FinancialInstallmentStatus } from '../../../../generated/prisma/client.js';

const STATUS_BY_UPSTREAM: Readonly<Record<string, FinancialInstallmentStatus>> = {
  EM_ABERTO: 'OPEN',
  PENDENTE: 'OPEN',
  OPEN: 'OPEN',
  ATRASADO: 'OVERDUE',
  OVERDUE: 'OVERDUE',
  RECEBIDO: 'PAID',
  PAGO: 'PAID',
  PAID: 'PAID',
  RECEBIDO_PARCIAL: 'PARTIALLY_PAID',
  PAGO_PARCIAL: 'PARTIALLY_PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PERDIDO: 'LOST',
  LOST: 'LOST',
  RENEGOCIADO: 'RENEGOTIATED',
  RENEGOTIATED: 'RENEGOTIATED',
};

export function mapInstallmentStatus(
  status: unknown,
  statusTraduzido: unknown,
): { readonly status: FinancialInstallmentStatus; readonly upstreamStatus: string | null } {
  const translated = typeof statusTraduzido === 'string' ? statusTraduzido.trim() : '';
  const raw = typeof status === 'string' ? status.trim() : '';
  const upstreamStatus = translated || raw || null;
  const key = (translated || raw).toUpperCase();
  if (!key) {
    return { status: 'UNKNOWN', upstreamStatus };
  }
  return {
    status: STATUS_BY_UPSTREAM[key] ?? 'UNKNOWN',
    upstreamStatus,
  };
}
