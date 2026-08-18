export type BullmqRedisOptions = {
  readonly url: string;
  readonly maxRetriesPerRequest: null;
};

export function createBullmqRedisOptions(redisUrl: string): BullmqRedisOptions {
  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function bullmqPrefix(nodeEnv: string): string {
  return `{de:${nodeEnv}}`;
}
