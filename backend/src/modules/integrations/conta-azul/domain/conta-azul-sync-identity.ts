export function cursorsHaveIdentityMismatch(
  cursors: readonly { readonly externalAccountId: string }[],
  currentExternalAccountId: string | null,
): boolean {
  if (cursors.length === 0) {
    return false;
  }
  if (!currentExternalAccountId) {
    return true;
  }
  return cursors.some((cursor) => cursor.externalAccountId !== currentExternalAccountId);
}
