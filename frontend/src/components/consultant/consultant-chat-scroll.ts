export const CHAT_NEAR_BOTTOM_PX = 96;

export type ChatScrollMetrics = {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

export function distanceFromBottom(metrics: ChatScrollMetrics): number {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
}

export function isNearChatBottom(
  metrics: ChatScrollMetrics,
  threshold = CHAT_NEAR_BOTTOM_PX,
): boolean {
  return distanceFromBottom(metrics) <= threshold;
}
