import { catalog } from '../catalog';
import { failure, success, type ContractResult } from './validation';

export const MAX_ROUTE_LENGTH = 40 * 1024;
export const MAX_SHARE_TOKEN_LENGTH = 32 * 1024;

/** Reserved identifiers from curriculum-map-ko.md; this does not publish or unlock content. */
export const COURSE_UNIT_COUNTS = Object.freeze({
  'course-1': 8,
  'course-2': 9,
  'course-3': 9,
  'course-4': 10,
  'course-5': 13,
  'course-6': 12,
  'course-7': 13,
  'course-8': 12
} as const);

export type CourseId = keyof typeof COURSE_UNIT_COUNTS;
export type UnitId = `${number}.${number}`;
export type ProductRoute =
  | { readonly kind: 'learn' }
  | { readonly kind: 'learn-course'; readonly courseId: CourseId }
  | { readonly kind: 'learn-unit'; readonly courseId: CourseId; readonly unitId: UnitId }
  | { readonly kind: 'lab' }
  | {
      readonly kind: 'lab-system';
      readonly systemId: `system:${string}`;
      readonly stateToken?: string;
    };

const systemIds = new Set(catalog.systems.map((system) => system.id));

export function isCourseId(value: unknown): value is CourseId {
  return typeof value === 'string' && Object.hasOwn(COURSE_UNIT_COUNTS, value);
}

export function isCourseUnitId(courseId: CourseId, value: unknown): value is UnitId {
  if (!isCourseId(courseId) || typeof value !== 'string' || !/^[1-8]\.[1-9][0-9]?$/.test(value)) return false;
  const [courseNumber, unitNumber] = value.split('.');
  return courseNumber === courseId.slice('course-'.length) && Number(unitNumber) <= COURSE_UNIT_COUNTS[courseId];
}

/** Syntax only. The share codec must validate the envelope and match its system ID before restoration. */
function validateToken(token: string): ContractResult<string> {
  if (token.length > MAX_SHARE_TOKEN_LENGTH) {
    return failure('payload-too-large', '$.stateToken', 'The share token exceeds the URL limit.', 'export-file');
  }
  if (!/^(?:pe1|ps1)\.[A-Za-z0-9_-]+$/.test(token)) {
    return failure('invalid-share-token', '$.stateToken', 'Expected a pe1 or ps1 token with unpadded base64url data.');
  }
  return success(token);
}

/**
 * Parse a hash, hash body, or the documented /next.html hash URL without URL normalization.
 * All identifiers are ASCII; percent escapes, external origins and legacy entrypoints are rejected.
 * Unknown routes are errors, never implicit redirects. No browser, storage or engine API is used.
 */
export function parseProductRoute(input: string): ContractResult<ProductRoute> {
  if (typeof input !== 'string') return failure('invalid-route', '$', 'A route must be a string.');
  if (input.length > MAX_ROUTE_LENGTH) {
    return failure('payload-too-large', '$', 'The route exceeds the URL limit.', 'export-file');
  }
  let body = input;
  if (body.startsWith('/next.html#')) body = body.slice('/next.html#'.length);
  else if (body.startsWith('#')) body = body.slice(1);
  if (!/^\/[A-Za-z0-9_./?=&-]+$/.test(body)) {
    return failure('invalid-route', '$', 'The route contains an unsupported prefix, encoding or character.');
  }

  const queryStart = body.indexOf('?');
  const path = queryStart < 0 ? body : body.slice(0, queryStart);
  const query = queryStart < 0 ? undefined : body.slice(queryStart + 1);
  let token: string | undefined;
  if (query !== undefined) {
    if (!query.startsWith('state=') || query.includes('&') || query.includes('?')) {
      return failure('invalid-route-query', '$', 'Only one state query parameter is supported.');
    }
    const result = validateToken(query.slice('state='.length));
    if (!result.ok) return result;
    token = result.value;
  }

  if (path === '/learn' || path === '/lab') {
    if (token !== undefined) return failure('invalid-route-query', '$', 'State requires a laboratory system.');
    return success({ kind: path === '/learn' ? 'learn' : 'lab' });
  }

  const parts = path.split('/');
  if (parts[1] === 'learn' && (parts.length === 3 || parts.length === 4)) {
    if (token !== undefined) return failure('invalid-route-query', '$', 'State requires a laboratory system.');
    const courseId = parts[2];
    if (!isCourseId(courseId)) return failure('unknown-course', '$.courseId', 'The course ID is not reserved.');
    if (parts.length === 3) return success({ kind: 'learn-course', courseId });
    const unitId = parts[3];
    if (!isCourseUnitId(courseId, unitId)) {
      return failure('unknown-unit', '$.unitId', 'The unit ID does not belong to this course.');
    }
    return success({ kind: 'learn-unit', courseId, unitId });
  }

  if (parts[1] === 'lab' && parts.length === 3) {
    const slug = parts[2]!;
    const systemId = `system:${slug}` as const;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !systemIds.has(systemId)) {
      return failure('unknown-system', '$.systemId', 'The system ID is not registered in the product catalog.');
    }
    return success({ kind: 'lab-system', systemId, ...(token === undefined ? {} : { stateToken: token }) });
  }
  return failure('invalid-route', '$', 'The route does not match a supported Learn or Lab path.');
}

/** Read data descriptors only: a malformed caller cannot run a getter or silently lose extra route fields. */
function routeFields(route: unknown): ContractResult<ReadonlyMap<string, unknown>> {
  if (typeof route !== 'object' || route === null || Array.isArray(route)) {
    return failure('invalid-route', '$', 'A route must be a plain record.');
  }
  try {
    const prototype = Object.getPrototypeOf(route);
    if (prototype !== Object.prototype && prototype !== null) {
      return failure('unsafe-data', '$', 'A route must not carry a custom prototype.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(route);
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return failure('unsafe-data', '$', 'Symbol route keys are not supported.');
      const descriptor = descriptors[key]!;
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        return failure('unsafe-data', '$', 'Route fields must be enumerable data properties.');
      }
      fields.set(key, descriptor.value);
    }
    return success(fields);
  } catch {
    return failure('unsafe-data', '$', 'The route could not be read as plain data.');
  }
}

/** Emit a canonical hash, independent of the host or deployment base path. */
export function serializeProductRoute(route: ProductRoute): ContractResult<string> {
  const inspected = routeFields(route);
  if (!inspected.ok) return inspected;
  const fields = inspected.value;
  const kind = fields.get('kind');
  let allowed: readonly string[];
  let path: string;
  switch (kind) {
    case 'learn':
    case 'lab':
      allowed = ['kind'];
      path = `/${kind}`;
      break;
    case 'learn-course':
    case 'learn-unit': {
      allowed = kind === 'learn-course' ? ['kind', 'courseId'] : ['kind', 'courseId', 'unitId'];
      const courseId = fields.get('courseId');
      if (!isCourseId(courseId)) return failure('unknown-course', '$.courseId', 'The course ID is not reserved.');
      path = `/learn/${courseId}`;
      if (kind === 'learn-unit') {
        const unitId = fields.get('unitId');
        if (!isCourseUnitId(courseId, unitId)) {
          return failure('unknown-unit', '$.unitId', 'The unit ID does not belong to this course.');
        }
        path += `/${unitId}`;
      }
      break;
    }
    case 'lab-system': {
      allowed = ['kind', 'systemId', 'stateToken'];
      const systemId = fields.get('systemId');
      if (typeof systemId !== 'string' || !systemIds.has(systemId as `system:${string}`)) {
        return failure('unknown-system', '$.systemId', 'The system ID is not registered in the product catalog.');
      }
      path = `/lab/${systemId.slice('system:'.length)}`;
      if (fields.has('stateToken')) {
        const token = fields.get('stateToken');
        if (typeof token !== 'string') {
          return failure('invalid-share-token', '$.stateToken', 'The share token must be a string.');
        }
        const result = validateToken(token);
        if (!result.ok) return result;
        path += `?state=${result.value}`;
      }
      break;
    }
    default:
      return failure('invalid-route', '$.kind', 'The route kind is not supported.');
  }
  for (const key of fields.keys()) {
    if (!allowed.includes(key)) return failure('unknown-field', '$', 'The route contains an unsupported field.');
  }
  const canonical = `#${path}`;
  // Keep parse and serialization subject to the same reserved identifiers and size limits.
  const checked = parseProductRoute(canonical);
  return checked.ok ? success(canonical) : checked;
}
