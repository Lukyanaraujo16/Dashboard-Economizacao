export function proactiveBalloonCopy(count: number): string {
  if (count <= 1) {
    return 'A Lia tem algo novo para te contar.';
  }
  return `Identifiquei ${count} situações que merecem sua atenção.`;
}

export function proactiveBatchSignature(insightIds: readonly string[]): string {
  return [...insightIds].sort().join('|');
}

export function liaProactiveShownKey(userId: string, tenantId: string): string {
  return `lia-proactive-shown:${userId}:${tenantId}`;
}

export function shouldManifestProactiveBatch(input: {
  readonly count: number;
  readonly signature: string;
  readonly alreadyShown: string | null;
}): boolean {
  return input.count > 0 && input.signature.length > 0 && input.alreadyShown !== input.signature;
}

export function visibleUnreadCount(count: number): string {
  if (count > 9) {
    return '9+';
  }
  return String(count);
}

export function playLiaMessageSound(): void {
  if (typeof Audio === 'undefined') {
    return;
  }
  try {
    const audio = new Audio('/lia-message.wav');
    audio.volume = 0.25;
    void audio.play().catch(() => undefined);
  } catch {
    // Autoplay bloqueado ou áudio indisponível não interrompe a Lia.
  }
}
