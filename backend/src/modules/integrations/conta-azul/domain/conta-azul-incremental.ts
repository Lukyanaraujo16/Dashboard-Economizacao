export const CONTA_AZUL_SYNC_CURSOR_OVERLAP_MS = 2 * 60 * 60 * 1000;

export const CONTA_AZUL_SYNC_ALTERATION_MAX_DAYS = 365;

const ALTERATION_CHUNK_MS = CONTA_AZUL_SYNC_ALTERATION_MAX_DAYS * 24 * 60 * 60 * 1000;

export type InstantWindow = {
  readonly from: Date;
  readonly to: Date;
};

export function subtractMilliseconds(instant: Date, ms: number): Date {
  return new Date(instant.getTime() - ms);
}

/**
 * Janela incremental: from = watermark − overlap; to = início da execução.
 * Watermark ausente usa o lastSuccessfulSyncAt da baseline manual.
 */
export function buildIncrementalWindow(input: {
  readonly cursorAt: Date | null;
  readonly baselineAt: Date;
  readonly executionStartedAt: Date;
  readonly overlapMs?: number;
}): InstantWindow {
  const overlapMs = input.overlapMs ?? CONTA_AZUL_SYNC_CURSOR_OVERLAP_MS;
  const watermark = input.cursorAt ?? input.baselineAt;
  const from = subtractMilliseconds(watermark, overlapMs);
  if (from.getTime() >= input.executionStartedAt.getTime()) {
    return { from: input.executionStartedAt, to: input.executionStartedAt };
  }
  return { from, to: input.executionStartedAt };
}

/** Fatia data_alteracao em blocos de no máximo 365 dias (changelog oficial). */
export function splitAlterationChunks(
  window: InstantWindow,
  maxChunkMs = ALTERATION_CHUNK_MS,
): InstantWindow[] {
  if (window.from.getTime() >= window.to.getTime()) {
    return [];
  }
  const chunks: InstantWindow[] = [];
  let cursor = window.from;
  while (cursor.getTime() < window.to.getTime()) {
    const chunkEndMs = Math.min(cursor.getTime() + maxChunkMs, window.to.getTime());
    chunks.push({ from: cursor, to: new Date(chunkEndMs) });
    cursor = new Date(chunkEndMs);
  }
  return chunks;
}
