/** Synthetic files exercise the validator only. They are never S28 certificates. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  captureBuildTree,
  captureSourceTree,
  digestFingerprint,
  evidenceHash,
  type ParityExecutionCapture
} from '../../../scripts/redesign/parity-capture';
import type { ParityCertificateBundle, ParityCertificatePolicy } from '../../../scripts/redesign/parity-certificate';

const active = new Set<string>();
export function cleanEvidenceFixtures() {
  const intended = path.resolve(process.cwd(), 'tmp');
  for (const directory of active) {
    const relative = path.relative(intended, path.resolve(directory));
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !path.basename(directory).startsWith('s28-evidence-unit-')
    )
      throw new Error('Refusing to delete an unverified fixture directory.');
    rmSync(directory, { recursive: true, force: true });
  }
  active.clear();
}
export function evidenceFixture() {
  const parent = path.resolve(process.cwd(), 'tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 's28-evidence-unit-'));
  active.add(root);
  const write = (relative: string, text: string) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  };
  const json = (relative: string, value: unknown) => write(relative, JSON.stringify(value, null, 2));
  const read = (relative: string) =>
    JSON.parse(readFileSync(path.join(root, relative), 'utf8')) as Record<string, unknown>;
  write('src/product/feature.ts', '// Synthetic validator fixture; not a product implementation.\n');
  write('src/physics/reference.ts', '// Synthetic frozen native fixture.\n');
  write('e2e/feature.spec.ts', '// Synthetic browser-case identity fixture.\n');
  write('tests/feature.test.ts', '// Synthetic unit-case identity fixture.\n');
  write('tmp/build/assets/Audio.js', 'fixture uppercase asset');
  write('tmp/build/assets/advanced.js', 'fixture lowercase asset');
  write('tmp/export.json', '{"schema":"synthetic-export/v1","value":4}\n');
  const base = {
    schema: 'pendulum-parity-execution/v1' as const,
    exitCode: 0,
    valid: true,
    errors: [],
    sourcePolicy: 'bounded-roots-pre-post/v1' as const,
    report: null,
    build: null,
    buildCapture: null
  };
  const buildSources = captureSourceTree(root, ['src']),
    files = captureBuildTree(root, 'tmp/build');
  const build: ParityExecutionCapture = {
    ...base,
    kind: 'build',
    command: [process.execPath, path.resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'tmp/build'],
    startedAt: '2020-01-01T00:00:00.000Z',
    finishedAt: '2020-01-01T00:00:01.000Z',
    sourceRoots: ['src'],
    sources: buildSources,
    sourceFingerprint: digestFingerprint(buildSources),
    build: { root: 'tmp/build', files, fingerprint: digestFingerprint(files) }
  };
  json('tmp/build-capture.json', build);
  const browserReport = {
    config: { rootDir: path.join(root, 'e2e') },
    errors: [],
    stats: { startTime: '2020-01-01T00:00:02.100Z', duration: 100, expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [
      {
        title: 'feature.spec.ts',
        specs: [],
        suites: [
          {
            title: 'synthetic validator fixture',
            suites: [],
            specs: [
              {
                title: 'uses native inputs, roundtrips settings and reads exported bytes',
                file: 'feature.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    expectedStatus: 'passed',
                    status: 'expected',
                    results: [
                      {
                        status: 'passed',
                        retry: 0,
                        errors: [],
                        attachments: [{ name: 'synthetic-export', path: path.join(root, 'tmp/export.json') }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const unitReport = {
    startTime: Date.parse('2020-01-01T00:00:02.100Z'),
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: [
      {
        name: path.join(root, 'tests/feature.test.ts'),
        status: 'passed',
        message: '',
        endTime: Date.parse('2020-01-01T00:00:02.200Z'),
        assertionResults: [
          {
            fullName: 'synthetic validator fixture exact native scalar comparison',
            status: 'passed',
            failureMessages: []
          }
        ]
      }
    ]
  };
  json('tmp/browser-report.json', browserReport);
  json('tmp/unit-report.json', unitReport);
  function capture(kind: 'playwright' | 'vitest'): ParityExecutionCapture {
    const sourceRoots = kind === 'playwright' ? ['src', 'e2e'] : ['src', 'tests'],
      sources = captureSourceTree(root, sourceRoots);
    const reportPath = kind === 'playwright' ? 'tmp/browser-report.json' : 'tmp/unit-report.json';
    return {
      ...base,
      kind,
      command: [
        process.execPath,
        path.resolve(
          root,
          kind === 'playwright' ? 'node_modules/@playwright/test/cli.js' : 'node_modules/vitest/vitest.mjs'
        ),
        kind === 'playwright' ? 'test' : 'run'
      ],
      startedAt: '2020-01-01T00:00:02.000Z',
      finishedAt: '2020-01-01T00:00:03.000Z',
      sourceRoots,
      sources,
      sourceFingerprint: digestFingerprint(sources),
      report: { path: reportPath, sha256: evidenceHash(readFileSync(path.join(root, reportPath))) },
      ...(kind === 'playwright'
        ? {
            build: build.build,
            buildCapture: {
              path: 'tmp/build-capture.json',
              sha256: evidenceHash(readFileSync(path.join(root, 'tmp/build-capture.json')))
            }
          }
        : {})
    };
  }
  json('tmp/browser-capture.json', capture('playwright'));
  json('tmp/unit-capture.json', capture('vitest'));
  const sources = ['src/product/feature.ts', 'src/physics/reference.ts'];
  const browserCase = {
    captureId: 'browser',
    file: 'e2e/feature.spec.ts',
    title: 'synthetic validator fixture › uses native inputs, roundtrips settings and reads exported bytes',
    project: 'chromium',
    sourcePaths: sources
  };
  const bundle: ParityCertificateBundle = {
    schema: 'pendulum-parity-certificates/v1',
    inventorySha256: 'a'.repeat(64),
    captures: [
      {
        id: 'browser',
        path: 'tmp/browser-capture.json',
        sha256: evidenceHash(readFileSync(path.join(root, 'tmp/browser-capture.json')))
      },
      {
        id: 'unit',
        path: 'tmp/unit-capture.json',
        sha256: evidenceHash(readFileSync(path.join(root, 'tmp/unit-capture.json')))
      }
    ],
    rows: [
      {
        id: 'synthetic:feature',
        evidence: [
          {
            ...browserCase,
            facet: 'ui',
            route: './next.html#/lab/double',
            assertion: 'Operates the real controls and verifies the displayed current value.'
          },
          {
            captureId: 'unit',
            file: 'tests/feature.test.ts',
            title: 'synthetic validator fixture exact native scalar comparison',
            project: null,
            sourcePaths: sources,
            facet: 'comparison',
            assertion: 'Compares all scalar results against the explicit native result.',
            comparison: {
              reference: 'preserved-native',
              quantity: 'all final state components',
              absoluteTolerance: 0,
              relativeTolerance: 0
            }
          },
          {
            ...browserCase,
            facet: 'roundtrip',
            roundtripSchema: 'synthetic-config/v1',
            assertion: 'Reloads settings and compares the exact canonical input values.'
          },
          {
            ...browserCase,
            facet: 'export',
            exported: { schemaOrMime: 'synthetic-export/v1', assertionOnly: true },
            assertion: 'Reads the actual downloaded JSON bytes and checks the exact schema/value.'
          }
        ]
      }
    ]
  };
  const policy: ParityCertificatePolicy = {
    inventorySha256: bundle.inventorySha256,
    rowIds: ['synthetic:feature'],
    requiredSources: { 'synthetic:feature': sources }
  };
  function repinCapture(id: string) {
    const reference = bundle.captures.find((value) => value.id === id)!;
    Reflect.set(reference, 'sha256', evidenceHash(readFileSync(path.join(root, reference.path))));
  }
  function rewriteCapture(id: string, mutate: (value: Record<string, unknown>) => void) {
    const reference = bundle.captures.find((value) => value.id === id)!;
    const value = read(reference.path);
    mutate(value);
    json(reference.path, value);
    repinCapture(id);
  }
  function rewriteReport(id: 'browser' | 'unit', mutate: (value: Record<string, unknown>) => void) {
    const capture = read(`tmp/${id}-capture.json`);
    const report = capture.report as { path: string; sha256: string };
    const value = read(report.path);
    mutate(value);
    json(report.path, value);
    report.sha256 = evidenceHash(readFileSync(path.join(root, report.path)));
    json(`tmp/${id}-capture.json`, capture);
    repinCapture(id);
  }
  function rewriteBuild(mutate: (value: Record<string, unknown>) => void) {
    const value = read('tmp/build-capture.json');
    mutate(value);
    json('tmp/build-capture.json', value);
    rewriteCapture('browser', (capture) => {
      Reflect.set(
        capture.buildCapture as object,
        'sha256',
        evidenceHash(readFileSync(path.join(root, 'tmp/build-capture.json')))
      );
    });
  }
  return { root, bundle, policy, write, json, read, rewriteCapture, rewriteReport, rewriteBuild };
}
