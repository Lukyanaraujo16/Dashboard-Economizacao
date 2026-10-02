const REMOVED_COMPANY_USER_EMAIL_SUFFIX = '@usuarios.excluido';

/** E-mail técnico que libera o endereço original e marca a remoção operacional. */
export function removedCompanyUserEmail(userId: string): string {
  return `excluido.${userId}${REMOVED_COMPANY_USER_EMAIL_SUFFIX}`;
}

export function isRemovedCompanyUserEmail(email: string): boolean {
  return email.toLowerCase().endsWith(REMOVED_COMPANY_USER_EMAIL_SUFFIX);
}

export const REMOVED_COMPANY_USER_EMAIL_FILTER = REMOVED_COMPANY_USER_EMAIL_SUFFIX;
