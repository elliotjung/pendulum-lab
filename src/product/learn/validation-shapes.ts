import { CANONICAL_UNITS } from '../contracts/quantities';
import { MAX_LEARN_CHECKPOINTS } from './schema';

export type ContentErrors = string[];
type Check = (value: unknown, path: string, errors: ContentErrors) => void;
const reject = (errors: ContentErrors, path: string, message: string) => errors.push(`${path}: ${message}`);
const test =
  (predicate: (value: unknown) => boolean, message: string): Check =>
  (value, path, errors) => {
    if (!predicate(value)) reject(errors, path, message);
  };
export const string = test((v) => typeof v === 'string' && v.trim().length > 0, 'Expected nonempty text.');
export const pattern = (regex: RegExp): Check =>
  test((v) => typeof v === 'string' && regex.test(v), `Invalid identifier or format (${regex.source}).`);
export const enumeration = (...values: readonly unknown[]): Check =>
  test((v) => values.includes(v), `Expected one of ${values.join(', ')}.`);
export const integer = test(
  (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0,
  'Expected positive integer.'
);
const finite = test((v) => typeof v === 'number' && Number.isFinite(v), 'Expected finite number.');
const normalized = test((v) => typeof v === 'number' && v >= 0 && v <= 1, 'Expected normalized coordinate in [0, 1].');
const bool = enumeration(true, false);
export const id = test(
  (value) =>
    typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !['constructor', 'prototype'].includes(value),
  'Expected a non-reserved block or option identifier.'
);
export const courseId = pattern(/^course-[1-8]$/);
export const unitId = pattern(/^[1-8]\.[1-9][0-9]?$/);
const fieldId = pattern(/^[a-z][a-zA-Z0-9_]{0,63}$/);
const symbolId = pattern(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
const unit = enumeration(...CANONICAL_UNITS);
export function array(check: Check, min = 0, max = 128): Check {
  return (value, path, errors) => {
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      reject(errors, path, `Expected array of ${min}–${max} entries.`);
      return;
    }
    value.forEach((entry, index) => check(entry, `${path}[${index}]`, errors));
  };
}
export function object(shape: Readonly<Record<string, Check>>): Check {
  return (value, path, errors) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      reject(errors, path, 'Expected object.');
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record))
      if (!Object.hasOwn(shape, key)) reject(errors, `${path}.${key}`, 'Unknown field.');
    for (const [key, check] of Object.entries(shape)) check(record[key], `${path}.${key}`, errors);
  };
}
export const textShape = object({ key: pattern(/^learn\.[a-zA-Z0-9.-]+$/), ko: string, en: string });
const refs = array(id, 1);
const quantity = object({ id: fieldId, value: finite, unit });
const recommendation = object({ courseId, unitId });
export const courseShape = object({
  schema: enumeration('pendulum-learn-course/v1'),
  id: courseId,
  order: integer,
  title: textShape,
  description: textShape,
  units: array(
    object({
      id: unitId,
      courseId,
      title: textShape,
      availability: enumeration('sample', 'published', 'planned'),
      contentVersion: (value, path, errors) => {
        if (value !== null) integer(value, path, errors);
      }
    }),
    1
  )
});
export const unitShape = object({
  schema: enumeration('pendulum-learn-unit/v1'),
  id: unitId,
  courseId,
  contentVersion: integer,
  kind: enumeration('sample', 'published'),
  title: textShape,
  summary: textShape,
  objectives: array(textShape, 1),
  prerequisites: array(object({ id, title: textShape, body: textShape, recommendedUnits: array(recommendation) })),
  concepts: array(object({ id, title: textShape, body: textShape, citationIds: refs }), 1),
  equations: array(
    object({
      id,
      title: textShape,
      expression: string,
      accessibleText: textShape,
      symbols: array(object({ symbol: symbolId, meaning: textShape, unit }), 1),
      citationIds: refs
    }),
    1
  ),
  figures: array(
    object({
      id,
      title: textShape,
      caption: textShape,
      alt: textShape,
      nodes: array(object({ id, x: normalized, y: normalized, label: textShape }), 1, 64),
      lines: array(object({ from: id, to: id }), 1, 128),
      citationIds: refs
    })
  ),
  glossary: array(object({ id, term: textShape, definition: textShape })),
  checks: array(
    object({
      id,
      prompt: textShape,
      correctOptionId: id,
      explanation: textShape,
      options: array(object({ id, label: textShape, feedback: textShape }), 2, 8)
    }),
    1,
    MAX_LEARN_CHECKPOINTS
  ),
  focusExperiment: object({
    status: enumeration('planned', 'ready'),
    kind: enumeration(
      'configuration',
      'kinematics',
      'energy-matrix',
      'lagrange',
      'term-balance',
      'normal-modes',
      'energy-exchange',
      'sensitivity'
    ),
    plotIds: array(
      enumeration(
        'configuration',
        'cartesian',
        'angular',
        'mass-matrix',
        'energy-terms',
        'derivation',
        'acceleration',
        'linear-modes',
        'energy-exchange',
        'sensitivity'
      ),
      1
    ),
    systemId: pattern(/^system:[a-z][a-z0-9-]*$/),
    exposedFields: array(fieldId, 1),
    fixedFields: array(quantity),
    defaultPreset: object({ integratorId: pattern(/^integrator:[a-z][a-z0-9-]*$/), fields: array(quantity, 1) }),
    analysisIds: array(pattern(/^analysis:[a-z][a-z0-9-]*$/), 1),
    guidance: array(textShape, 1),
    successCriteria: array(textShape, 1),
    tasks: array(
      object({ id, prediction: textShape, action: textShape, expected: textShape, explanation: textShape }),
      1
    )
  }),
  labTransfer: object({
    status: enumeration('planned', 'ready'),
    systemId: pattern(/^system:[a-z][a-z0-9-]*$/),
    sourceUnitId: unitId,
    description: textShape
  }),
  references: array(
    object({
      id,
      title: textShape,
      authors: string,
      url: string,
      locator: textShape,
      accessedOn: pattern(/^\d{4}-\d{2}-\d{2}$/)
    }),
    1
  ),
  review: object({
    schemaVerified: bool,
    automatedVerified: bool,
    sourceChecked: bool,
    humanReviewed: bool,
    note: textShape
  })
});
