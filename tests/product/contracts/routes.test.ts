import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../src/product/catalog';
import {
  COURSE_UNIT_COUNTS,
  MAX_ROUTE_LENGTH,
  MAX_SHARE_TOKEN_LENGTH,
  isCourseId,
  isCourseUnitId,
  parseProductRoute,
  serializeProductRoute,
  type CourseId,
  type ProductRoute,
  type UnitId
} from '../../../src/product/contracts/routes';
import type { ContractResult } from '../../../src/product/contracts/validation';

function value<T>(result: ContractResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

const curriculum = readFileSync(new URL('../../../documents/redesign/curriculum-map-ko.md', import.meta.url), 'utf8');
const units = [...curriculum.matchAll(/^\| ([1-8]\.\d+) \|/gm)].map((match) => match[1] as UnitId);
const courses = Object.keys(COURSE_UNIT_COUNTS) as CourseId[];
const systemRoutes: ProductRoute[] = catalog.systems.map(({ id }) => ({ kind: 'lab-system', systemId: id }));
const unitRoutes: ProductRoute[] = units.map((unitId) => ({
  kind: 'learn-unit',
  courseId: `course-${unitId.split('.')[0]}` as CourseId,
  unitId
}));
const reservedRoutes: ProductRoute[] = [
  { kind: 'learn' },
  { kind: 'lab' },
  ...courses.map((courseId) => ({ kind: 'learn-course' as const, courseId })),
  ...unitRoutes,
  ...systemRoutes
];

describe('S03 pure Learn and Lab route contract', () => {
  it.each([
    ['/learn', { kind: 'learn' }],
    ['/learn/course-1', { kind: 'learn-course', courseId: 'course-1' }],
    ['/learn/course-1/1.8', { kind: 'learn-unit', courseId: 'course-1', unitId: '1.8' }],
    ['/lab', { kind: 'lab' }],
    ['/lab/double', { kind: 'lab-system', systemId: 'system:double' }],
    ['/lab/langevin?state=pe1.YWJjZA', { kind: 'lab-system', systemId: 'system:langevin', stateToken: 'pe1.YWJjZA' }]
  ] as const)('accepts the documented route forms for %s', (path, expected) => {
    for (const input of [path, `#${path}`, `/next.html#${path}`]) {
      expect(value(parseProductRoute(input))).toEqual(expected);
    }
    expect(value(serializeProductRoute(expected))).toBe(`#${path}`);
  });

  it('reserves exactly the documented 8 courses and 86 units without implying published content', () => {
    expect(courses).toHaveLength(8);
    expect(units).toHaveLength(86);
    expect(new Set(units).size).toBe(86);
    for (const courseId of courses) {
      const documented = units.filter((id) => id.startsWith(`${courseId.slice('course-'.length)}.`));
      expect(documented).toHaveLength(COURSE_UNIT_COUNTS[courseId]);
      for (const unitId of documented) expect(isCourseUnitId(courseId, unitId)).toBe(true);
    }
    for (const route of reservedRoutes)
      expect(value(parseProductRoute(value(serializeProductRoute(route))))).toEqual(route);
  });

  it('maps every stable S02 system ID to its unprefixed URL slug and back', () => {
    expect(systemRoutes).toHaveLength(35);
    expect(systemRoutes).toContainEqual({ kind: 'lab-system', systemId: 'system:frenkel-kontorova' });
    for (const { id } of catalog.systems) {
      const hash = value(serializeProductRoute({ kind: 'lab-system', systemId: id }));
      expect(hash).toBe(`#/lab/${id.slice('system:'.length)}`);
      expect(value(parseProductRoute(hash))).toEqual({ kind: 'lab-system', systemId: id });
    }
  });

  it.each([
    '',
    '/',
    '#',
    '#/',
    '/next.html',
    '/app.html#/lab',
    'next.html#/lab',
    'https://example.test/next.html#/lab',
    '//example.test/next.html#/lab',
    'javascript:alert(1)',
    '/lab/',
    '/lab//double',
    '/lab/double/extra',
    '/learn/',
    '/learn/course-1/1.1/extra',
    '/unknown',
    '/Learn',
    '/LAB',
    '/learn/course-01',
    '/learn/course-0',
    '/learn/course-9',
    '/learn/course-1/1.0',
    '/learn/course-1/1.9',
    '/learn/course-1/2.1',
    '/learn/course-2/2.10',
    '/learn/course-5/5.14',
    '/learn/course-8/8.13',
    '/learn/course-1/1.01',
    '/learn/course-1/1.1e0',
    '/learn/course-1/1.1.0',
    '/lab/Double',
    '/lab/system:double',
    '/lab/missing',
    '/lab/__proto__',
    '/lab/constructor',
    '/lab/toString',
    '/lab/../../learn',
    '/learn/course-1/..',
    '/lab/./double',
    '/lab/../double',
    '/lab\\double',
    '/lab/%64ouble',
    '/lab/%2e%2e',
    '/lab/%252e%252e',
    '/lab/%2Fdouble',
    '/lab/%5cdouble',
    '/lab/%',
    '/lab/%FF',
    '/lab/더블',
    '/lab/double\u0000',
    '/lab/double\n',
    ' /lab',
    '/lab ',
    '/lab/double#fragment'
  ])('rejects unknown, malformed or unsafe route %j', (input) => {
    expect(parseProductRoute(input).ok).toBe(false);
  });

  it.each([
    '/lab?',
    '/lab/double?',
    '/lab/double?state',
    '/lab/double?state=',
    '/lab/double?unknown=1',
    '/lab/double?State=pe1.YQ',
    '/lab/double?%73tate=pe1.YQ',
    '/lab/double?state=pe1.YQ&state=pe1.Yg',
    '/lab/double?state=pe1.YQ&unknown=1',
    '/lab/double?state=pe1.YQ&',
    '/lab/double?state=pe1.YQ?state=pe1.Yg',
    '/learn?state=pe1.YQ',
    '/learn/course-1?state=pe1.YQ',
    '/learn/course-1/1.1?state=pe1.YQ',
    '/lab?state=pe1.YQ',
    '/lab/double?state=pe2.YQ',
    '/lab/double?state=pe1.',
    '/lab/double?state=pe1.YQ==',
    '/lab/double?state=pe1.YQ+/',
    '/lab/double?state=pe1.%59Q',
    '/lab/double?state=pe1.YQ#another',
    '/lab/double?state=pe1.YQ=more'
  ])('rejects unknown, repeated or malformed query %j', (input) => {
    expect(parseProductRoute(input).ok).toBe(false);
  });

  it('enforces input and token limits before accepting route data and gives a file-export recovery', () => {
    const token = `pe1.${'A'.repeat(MAX_SHARE_TOKEN_LENGTH - 4)}`;
    const route: ProductRoute = { kind: 'lab-system', systemId: 'system:double', stateToken: token };
    expect(value(parseProductRoute(value(serializeProductRoute(route))))).toEqual(route);
    for (const result of [
      parseProductRoute(`#/lab/double?state=${token}A`),
      serializeProductRoute({ ...route, stateToken: `${token}A` }),
      parseProductRoute(`#/lab/${'A'.repeat(MAX_ROUTE_LENGTH)}`)
    ]) {
      expect(result).toMatchObject({
        ok: false,
        issues: [{ code: 'payload-too-large', recovery: 'export-file' }]
      });
    }
  });

  it('keeps token syntax validation separate from semantic envelope restoration', () => {
    expect(value(parseProductRoute('#/lab/double?state=pe1.bm90LWpzb24'))).toEqual({
      kind: 'lab-system',
      systemId: 'system:double',
      stateToken: 'pe1.bm90LWpzb24'
    });
  });

  it('defends malformed JavaScript callers as well as URL strings', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      1,
      true,
      [],
      'lab',
      {},
      { kind: 'missing' },
      { kind: ['lab'] },
      { kind: 'lab', stateToken: 'pe1.YQ' },
      { kind: 'lab', layout: 'wide' },
      { kind: 'learn-course' },
      { kind: 'learn-course', courseId: 'course-0' },
      { kind: 'learn-course', courseId: ['course-1'] },
      { kind: 'learn-unit', courseId: 'course-1', unitId: '2.1' },
      { kind: 'learn-unit', courseId: 'course-1', unitId: 1.1 },
      { kind: 'lab-system', systemId: 'double' },
      { kind: 'lab-system', systemId: 'system:missing' },
      { kind: 'lab-system', systemId: ['system:double'] },
      { kind: 'lab-system', systemId: 'system:double', stateToken: undefined },
      { kind: 'lab-system', systemId: 'system:double', stateToken: null },
      { kind: 'lab-system', systemId: 'system:double', stateToken: 'pe1.YQ=' },
      JSON.parse('{"kind":"lab","__proto__":{"polluted":true}}'),
      Object.assign(Object.create({ inherited: true }), { kind: 'lab' })
    ];
    for (const input of malformed) expect(serializeProductRoute(input as ProductRoute).ok).toBe(false);
    for (const input of [null, undefined, 1, true, {}, []]) expect(parseProductRoute(input as string).ok).toBe(false);
    expect(isCourseId('__proto__')).toBe(false);
    expect(isCourseUnitId('course-9' as CourseId, '9.1')).toBe(false);
  });

  it('never invokes accessors or drops symbol/non-enumerable route fields', () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, 'kind', {
      enumerable: true,
      get() {
        invoked = true;
        return 'lab';
      }
    });
    const symbol = { kind: 'lab', [Symbol('extra')]: true };
    const hidden = Object.defineProperty({ kind: 'lab' }, 'extra', { value: 1 });
    for (const input of [accessor, symbol, hidden]) {
      expect(serializeProductRoute(input as ProductRoute)).toMatchObject({
        ok: false,
        issues: [{ code: 'unsafe-data' }]
      });
    }
    expect(invoked).toBe(false);
    expect(value(serializeProductRoute(Object.assign(Object.create(null), { kind: 'lab' })))).toBe('#/lab');
  });

  it('does not echo hostile values into route errors', () => {
    const marker = '<script>alert("private")</script>';
    expect(JSON.stringify(parseProductRoute(`#/lab/${marker}`))).not.toContain(marker);
    expect(JSON.stringify(serializeProductRoute({ kind: marker } as unknown as ProductRoute))).not.toContain(marker);
  });
});

describe('route round-trip properties', () => {
  it('preserves every route family and arbitrary URL-safe token bytes with deterministic serialization', () => {
    const token = fc
      .uint8Array({ minLength: 1, maxLength: 1024 })
      .map((bytes) => `pe1.${Buffer.from(bytes).toString('base64url')}`);
    const shared: fc.Arbitrary<ProductRoute> = fc
      .tuple(fc.constantFrom(...catalog.systems), token)
      .map(([system, stateToken]) => ({
        kind: 'lab-system',
        systemId: system.id,
        stateToken
      }));
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...reservedRoutes), shared), (route) => {
        const hash = value(serializeProductRoute(route));
        expect(value(parseProductRoute(hash))).toEqual(route);
        expect(value(parseProductRoute(`/next.html${hash}`))).toEqual(route);
        expect(value(serializeProductRoute(value(parseProductRoute(hash))))).toBe(hash);
        expect(value(serializeProductRoute(Object.fromEntries(Object.entries(route).reverse()) as ProductRoute))).toBe(
          hash
        );
      }),
      { seed: 0x5303, numRuns: 300 }
    );
  });

  it('handles arbitrary strings and JSON records without throwing or normalizing away unknown data', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const parsed = parseProductRoute(input);
        if (parsed.ok)
          expect(value(parseProductRoute(value(serializeProductRoute(parsed.value))))).toEqual(parsed.value);
      }),
      { seed: 0x5304, numRuns: 300 }
    );
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const serialized = serializeProductRoute(input as ProductRoute);
        if (serialized.ok) expect(value(parseProductRoute(serialized.value))).toEqual(input);
      }),
      { seed: 0x5305, numRuns: 300 }
    );
  });
});
