import type { ResearchDbStoreName } from './researchDb';

export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isPlainPayloadRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function optionalString(payload: Record<string, unknown>, key: string, maxLength: number): boolean {
  return (
    !Object.hasOwn(payload, key) ||
    (typeof payload[key] === 'string' && payload[key].length > 0 && payload[key].length <= maxLength)
  );
}

function optionalRecord(payload: Record<string, unknown>, key: string): boolean {
  return !Object.hasOwn(payload, key) || isPlainPayloadRecord(payload[key]);
}

function optionalArray(payload: Record<string, unknown>, key: string): boolean {
  return !Object.hasOwn(payload, key) || Array.isArray(payload[key]);
}

function optionalNonNegativeInteger(payload: Record<string, unknown>, key: string): boolean {
  return (
    !Object.hasOwn(payload, key) ||
    (typeof payload[key] === 'number' && Number.isSafeInteger(payload[key]) && payload[key] >= 0)
  );
}

/** Store-specific minimums accept sparse historical objects while rejecting type-confused current fields. */
export function validResearchDbPayload(
  name: ResearchDbStoreName,
  recordId: string,
  value: unknown,
  maxIdLength: number
): boolean {
  if (name === 'settings') {
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'object'
    );
  }
  if (!isPlainPayloadRecord(value)) return false;
  if (name === 'experiments') {
    return (
      optionalString(value, 'id', maxIdLength) &&
      (!Object.hasOwn(value, 'id') || value.id === recordId) &&
      optionalString(value, 'name', 512) &&
      optionalRecord(value, 'snapshot') &&
      optionalRecord(value, 'metrics') &&
      optionalArray(value, 'tags')
    );
  }
  if (name === 'runLog') {
    return (
      optionalString(value, 'id', maxIdLength) &&
      (!Object.hasOwn(value, 'id') || value.id === recordId) &&
      optionalString(value, 'type', maxIdLength) &&
      optionalString(value, 'method', maxIdLength) &&
      optionalString(value, 'system', maxIdLength) &&
      optionalRecord(value, 'metrics')
    );
  }
  if (name === 'parameterStudies') {
    return (
      optionalString(value, 'id', maxIdLength) &&
      optionalString(value, 'variable', maxIdLength) &&
      optionalArray(value, 'variables') &&
      optionalArray(value, 'experiments') &&
      optionalArray(value, 'points')
    );
  }
  if (name === 'studyResults') {
    return (
      optionalString(value, 'studyId', maxIdLength) &&
      optionalString(value, 'pointId', maxIdLength) &&
      optionalRecord(value, 'patch') &&
      optionalRecord(value, 'results')
    );
  }
  if (name === 'figures') {
    return (
      optionalString(value, 'id', maxIdLength) &&
      (!Object.hasOwn(value, 'id') || value.id === recordId) &&
      optionalString(value, 'caption', 400) &&
      optionalString(value, 'dataUrl', 24 * 1024 * 1024) &&
      optionalNonNegativeInteger(value, 'width') &&
      optionalNonNegativeInteger(value, 'height')
    );
  }
  return (
    optionalNonNegativeInteger(value, 'fileCount') &&
    optionalNonNegativeInteger(value, 'figureCount') &&
    optionalNonNegativeInteger(value, 'bytes') &&
    (!Object.hasOwn(value, 'zip') || (typeof value.zip === 'object' && value.zip !== null))
  );
}
