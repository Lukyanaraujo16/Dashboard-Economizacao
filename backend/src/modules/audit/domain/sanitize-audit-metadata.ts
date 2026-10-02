import type { Prisma } from '../../../generated/prisma/client.js';

type AuditJson = string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

const SENSITIVE_KEY =
  /(password|passwd|secret|token|credential|authorization|prompt|hash|api[-_]?key|oauth|bearer|refresh|private[-_]?key)/i;

const MAX_STRING = 80;
const MAX_KEYS = 12;
const MAX_ARRAY = 12;

function isSensitiveAuditKey(key: string): boolean {
  if (SENSITIVE_KEY.test(key)) {
    return true;
  }
  return key === 'content' || key === 'body' || key === 'payload' || key === 'minimumAmount';
}

function sanitizeScalar(value: unknown): AuditJson | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_STRING) {
      return undefined;
    }
    return trimmed;
  }
  return undefined;
}

function sanitizeValue(value: unknown, depth: number): AuditJson | undefined {
  const scalar = sanitizeScalar(value);
  if (scalar !== undefined || value === null) {
    return scalar;
  }
  if (depth >= 1) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items: AuditJson[] = [];
    for (const item of value) {
      const sanitized = sanitizeScalar(item);
      if (sanitized === undefined) {
        continue;
      }
      items.push(sanitized);
      if (items.length >= MAX_ARRAY) {
        break;
      }
    }
    return items;
  }
  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }
  return undefined;
}

function sanitizeObject(
  source: Record<string, unknown>,
  depth: number,
): { [key: string]: AuditJson } {
  const result: { [key: string]: AuditJson } = {};
  for (const key of Object.keys(source)) {
    if (Object.keys(result).length >= MAX_KEYS) {
      break;
    }
    if (isSensitiveAuditKey(key)) {
      continue;
    }
    const sanitized = sanitizeValue(source[key], depth);
    if (sanitized === undefined) {
      continue;
    }
    if (
      typeof sanitized === 'object' &&
      sanitized !== null &&
      !Array.isArray(sanitized) &&
      Object.keys(sanitized).length === 0
    ) {
      continue;
    }
    result[key] = sanitized;
  }
  return result;
}

/** Remove segredos e conteúdo antes de persistir ou devolver metadata. */
export function sanitizeAuditMetadata(value: unknown): Prisma.InputJsonObject | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const sanitized = sanitizeObject(value as Record<string, unknown>, 0);
  if (Object.keys(sanitized).length === 0) {
    return null;
  }
  return sanitized as Prisma.InputJsonObject;
}

/** Nomes de campos alterados, sem valores e sem chaves sensíveis. */
export function safeAuditFieldNames(source: object): string[] {
  return Object.keys(source)
    .filter((key) => !isSensitiveAuditKey(key))
    .slice(0, MAX_KEYS)
    .sort();
}

export function fieldNamesMetadata(source: object): Record<string, unknown> | null {
  const fields = safeAuditFieldNames(source);
  if (fields.length === 0) {
    return null;
  }
  return { fields };
}
