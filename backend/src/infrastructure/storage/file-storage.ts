export type StoredObject = {
  readonly body: Buffer;
  readonly mimeType?: string;
};

export type FileStorage = {
  put(storageKey: string, body: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
};
