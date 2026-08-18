export type ContaAzulPayloadResource = 'pessoas';

export type ContaAzulReceivedShape =
  | 'null'
  | 'undefined'
  | 'array'
  | 'object'
  | 'string'
  | 'empty-string'
  | 'number'
  | 'boolean'
  | 'bigint'
  | 'symbol'
  | 'function'
  | 'non_json_response';

export type ContaAzulPayloadDiagnostic = {
  readonly resource: ContaAzulPayloadResource;
  readonly field?: string;
  readonly index?: number;
  readonly expected?: string;
  readonly received?: ContaAzulReceivedShape;
  readonly stage?: 'json_parse';
  readonly page?: number;
};

export function describeReceivedShape(value: unknown): ContaAzulReceivedShape {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return 'empty-string';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'bigint') {
    return 'bigint';
  }
  if (typeof value === 'symbol') {
    return 'symbol';
  }
  if (typeof value === 'function') {
    return 'function';
  }
  return 'string';
}

export function formatPayloadDiagnostic(diagnostic: ContaAzulPayloadDiagnostic): string {
  const parts = [`resource=${diagnostic.resource}`];
  if (diagnostic.stage) {
    parts.push(`stage=${diagnostic.stage}`);
  }
  if (diagnostic.field) {
    parts.push(`field=${diagnostic.field}`);
  }
  if (diagnostic.index !== undefined) {
    parts.push(`index=${diagnostic.index}`);
  }
  if (diagnostic.expected) {
    parts.push(`expected=${diagnostic.expected}`);
  }
  if (diagnostic.received) {
    parts.push(`received=${diagnostic.received}`);
  }
  if (diagnostic.page !== undefined) {
    parts.push(`page=${diagnostic.page}`);
  }
  return parts.join(' ');
}

export function toSanitizedPayloadLog(input: {
  readonly syncRunId: string;
  readonly tenantId: string;
  readonly errorCode: string;
  readonly diagnostic?: ContaAzulPayloadDiagnostic;
}): Record<string, string | number> {
  const entry: Record<string, string | number> = {
    msg: 'conta_azul_sync_payload_invalid',
    syncRunId: input.syncRunId,
    tenantId: input.tenantId,
    errorCode: input.errorCode,
  };
  const diagnostic = input.diagnostic;
  if (!diagnostic) {
    return entry;
  }
  entry.resource = diagnostic.resource;
  if (diagnostic.stage) {
    entry.stage = diagnostic.stage;
  }
  if (diagnostic.field) {
    entry.field = diagnostic.field;
  }
  if (diagnostic.index !== undefined) {
    entry.index = diagnostic.index;
  }
  if (diagnostic.expected) {
    entry.expected = diagnostic.expected;
  }
  if (diagnostic.received) {
    entry.received = diagnostic.received;
  }
  if (diagnostic.page !== undefined) {
    entry.page = diagnostic.page;
  }
  return entry;
}
