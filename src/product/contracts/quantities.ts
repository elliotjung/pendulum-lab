import { inspectSafeData } from '../persistence/safe-data';
import { fields, invalid, isFieldName, isRecord } from './contract-checks';
import { success, type ContractIssue, type ContractResult } from './validation';

/** SI magnitudes only. rad is explicit even though plane angle is dimensionless in SI. */
export const CANONICAL_UNITS = [
  '1',
  'rad',
  's',
  'm',
  'kg',
  'm/s',
  'm/s^2',
  'rad/s',
  'rad/s^2',
  's^-1',
  's^-2',
  'kg*m^2',
  'kg*m^2/s',
  'N',
  'N/rad',
  'N*s/rad',
  'N/m',
  'N*s/m',
  'J',
  'J*s',
  'W',
  'Hz'
] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];
export const SOURCE_UNITS = [...CANONICAL_UNITS, 'deg', 'deg/s', 'deg/s^2', 'ms', 'min', 'cm', 'mm', 'g'] as const;
export type SourceUnit = (typeof SOURCE_UNITS)[number];
export const MAX_QUANTITIES = 256;
export const MAX_QUANTITY_VECTOR_LENGTH = 4096;

export type QuantityValue =
  | { readonly kind: 'scalar'; readonly value: number; readonly unit: CanonicalUnit }
  | { readonly kind: 'vector'; readonly values: readonly number[]; readonly unit: CanonicalUnit }
  | {
      readonly kind: 'complex-vector';
      readonly re: readonly number[];
      readonly im: readonly number[];
      readonly unit: CanonicalUnit;
    };
export type QuantityMap = Readonly<Record<string, QuantityValue>>;

function vector(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUANTITY_VECTOR_LENGTH) {
    invalid(issues, path, `Expected 1–${MAX_QUANTITY_VECTOR_LENGTH} finite vector components.`);
    return;
  }
  value.forEach((component, index) => {
    if (typeof component !== 'number' || !Number.isFinite(component))
      invalid(issues, `${path}[${index}]`, 'Expected a finite number.');
  });
}

export function checkQuantity(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected a quantity object.');
    return;
  }
  if (!(CANONICAL_UNITS as readonly unknown[]).includes(value.unit))
    invalid(issues, `${path}.unit`, 'Expected an explicit supported canonical SI unit.');
  switch (value.kind) {
    case 'scalar':
      fields(value, ['kind', 'value', 'unit'], [], path, issues);
      if (typeof value.value !== 'number' || !Number.isFinite(value.value))
        invalid(issues, `${path}.value`, 'Expected a finite scalar.');
      break;
    case 'vector':
      fields(value, ['kind', 'values', 'unit'], [], path, issues);
      vector(value.values, `${path}.values`, issues);
      break;
    case 'complex-vector':
      fields(value, ['kind', 're', 'im', 'unit'], [], path, issues);
      vector(value.re, `${path}.re`, issues);
      vector(value.im, `${path}.im`, issues);
      if (Array.isArray(value.re) && Array.isArray(value.im) && value.re.length !== value.im.length) {
        invalid(issues, path, 'Real and imaginary vectors must have equal lengths.');
      }
      break;
    default:
      invalid(issues, `${path}.kind`, 'Expected scalar, vector, or complex-vector.');
  }
}

export function checkQuantityMap(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!isRecord(value)) {
    invalid(issues, path, 'Expected a quantity map.');
    return;
  }
  if (Object.keys(value).length > MAX_QUANTITIES) {
    invalid(issues, path, 'Too many quantities.');
    return;
  }
  for (const [name, quantity] of Object.entries(value)) {
    if (!isFieldName(name)) invalid(issues, `${path}.${name}`, 'Expected an adapter-defined field name.');
    checkQuantity(quantity, `${path}.${name}`, issues);
  }
}

export function validateQuantityValue(input: unknown): ContractResult<QuantityValue> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  checkQuantity(safe.value, '$', issues);
  return issues.length ? { ok: false, issues } : success(safe.value as QuantityValue);
}
