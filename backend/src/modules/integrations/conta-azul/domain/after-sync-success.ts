/** Depois do sync já marcado como sucesso. Falha aqui não desfaz o sync. */
export async function runAfterSyncSuccess(
  tenantId: string,
  hook: ((tenantId: string) => Promise<void>) | undefined,
): Promise<void> {
  if (!hook) {
    return;
  }
  try {
    await hook(tenantId);
  } catch {
    process.stdout.write(
      `${JSON.stringify({ event: 'proactive_evaluation_enqueue_failed', tenantId })}\n`,
    );
  }
}
