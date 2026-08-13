import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { assertEvidenceSourceCommit, evidenceWorktreeIsDirty } from '../scripts/evidence-provenance';
import { relaxCspForFileProtocolHtml } from '../vite.config.standalone';

const DRIFT_GATED_WORKFLOWS = [
  'pages.yml',
  'main.yml',
  'ci.yml',
  'release.yml',
  'publish-npm.yml',
  'publish-jsr.yml',
  'cloudflare-pages.yml'
];

const FULL_HISTORY_VERIFY_JOBS = [
  ['ci.yml', 'verify'],
  ['cloudflare-pages.yml', 'deploy'],
  ['main.yml', 'science-and-build'],
  ['pages.yml', 'quality-gate'],
  ['publish-jsr.yml', 'publish'],
  ['publish-npm.yml', 'publish'],
  ['release.yml', 'release-artifacts'],
  ['release.yml', 'jsr-publish']
] as const;

function workflowJob(source: string, name: string): string {
  const start = source.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) return '';
  const followingJob = source.slice(start + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  return followingJob < 0 ? source.slice(start) : source.slice(start, start + 1 + followingJob);
}

describe('generated-drift workflow contract', () => {
  test.each(DRIFT_GATED_WORKFLOWS)('%s checks tracked drift without restoring an ignored report', async (name) => {
    const source = await readFile(`.github/workflows/${name}`, 'utf8');
    expect(source).toContain('run: git diff --exit-code');
    expect(source).not.toMatch(/git restore[^\n]*vitest-results\.json/);
    expect(source).not.toMatch(/git checkout[^\n]*vitest-results\.json/);
  });

  test.each(FULL_HISTORY_VERIFY_JOBS)(
    '%s %s checks out full history before verifying evidence lineage',
    async (file, jobName) => {
      const source = await readFile(`.github/workflows/${file}`, 'utf8');
      const job = workflowJob(source, jobName);
      expect(job).toContain('npm run verify');
      const checkoutStep = job.match(/^      - uses: actions\/checkout@[^\r\n]*(?:\r?\n(?!      - ).*)*/m)?.[0];
      expect(checkoutStep).toContain('fetch-depth: 0');
    }
  );

  test('Pages deploys only the exact commit from a successful full mainline validation', async () => {
    const source = await readFile('.github/workflows/pages.yml', 'utf8');
    expect(source).toContain('workflow_run:');
    expect(source).toContain('workflows: [Mainline Full Validation]');
    expect(source).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(source).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    expect(source).toContain('group: pages-${{ github.event.workflow_run.head_branch }}');
    expect(source).not.toContain('group: pages-${{ github.event.workflow_run.head_sha }}');
    expect(source).not.toMatch(/^\s{2}push:/m);
    expect(source).not.toContain('workflow_dispatch:');
    expect(source).toContain('needs: [quality-gate, production-e2e, compatibility-e2e]');
  });

  test('evidence dispatch fails closed, validates provenance, and bounds network waits', async () => {
    const source = await readFile('.github/workflows/evidence-dispatch.yml', 'utf8');
    expect(source).toContain('LANDING_DISPATCH_TOKEN is required');
    expect(source).toContain('/^[0-9a-f]{40}$/i');
    expect(source).toContain('p?.dirtyWorktree!==false');
    expect(source).toContain('t?.failed!==0');
    expect(source).toContain('t?.passed!==t?.total');
    expect(source).toContain('t?.success!==true');
    expect(source).toContain("Date.parse(p?.expiresAt??'')");
    expect(source).toContain('refusing to dispatch expired evidence');
    expect(source).toContain('--retry-all-errors');
    expect(source).toContain('--connect-timeout 10 --max-time 60');
  });

  test('tag release validates evidence provenance and bounds every cross-repository request', async () => {
    const source = await readFile('.github/workflows/release.yml', 'utf8');
    expect(source).toContain('[[ ! "$evidence_source_commit" =~ ^[0-9a-f]{40}$ ]]');
    expect(source).toContain('Reject stale or uncommitted release evidence');
    expect(source).toContain('release evidence was generated from a dirty worktree');
    expect(source).toContain('release evidence is expired');
    const releaseGate = source.slice(source.indexOf('- name: Dispatch and wait for the landing release gate'));
    const curls = releaseGate.match(/curl[^\n]*(?:\\\n[^\n]*)*/g) ?? [];
    expect(curls.length).toBeGreaterThanOrEqual(3);
    for (const curl of curls.slice(0, 3)) {
      expect(curl).toContain('--retry-all-errors');
      expect(curl).toContain('--connect-timeout 10 --max-time 60');
    }
  });

  test('local evidence checks reject dirty or expired release coordinates', async () => {
    const source = await readFile('scripts/evidence-summary.ts', 'utf8');
    expect(source).toContain('assertReleaseReadyEvidence(committed)');
    expect(source).toContain('evidenceWorktreeIsDirty()');
    expect(source).toContain('assertEvidenceSourceCommit(sourceCommit)');
    expect(source).toContain('evidence.provenance?.dirtyWorktree !== false');
    expect(source).toContain('expiresAt <= Date.now()');
    expect(source).toContain('expiresAt <= generatedAt');
  });

  test('evidence provenance counts untracked files and permits only evidence-only descendant commits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pendulum-evidence-provenance-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'ci@example.invalid');
      git('config', 'user.name', 'CI contract');
      await writeFile(join(directory, 'source.txt'), 'source\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'source');
      const sourceCommit = git('rev-parse', 'HEAD').trim();

      expect(evidenceWorktreeIsDirty(directory)).toBe(false);
      await writeFile(join(directory, 'untracked.txt'), 'must count as dirty\n');
      expect(evidenceWorktreeIsDirty(directory)).toBe(true);
      await rm(join(directory, 'untracked.txt'));

      await mkdir(join(directory, 'reports'));
      await writeFile(join(directory, 'reports', 'evidence-summary.json'), '{}\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'evidence only');
      expect(() => assertEvidenceSourceCommit(sourceCommit, directory)).not.toThrow();

      await writeFile(join(directory, 'source.txt'), 'changed source\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'source change');
      expect(() => assertEvidenceSourceCommit(sourceCommit, directory)).toThrow(/non-evidence changes/);
      expect(() => assertEvidenceSourceCommit(git('rev-parse', 'HEAD').trim(), directory)).not.toThrow();
      expect(() => assertEvidenceSourceCommit('f'.repeat(40), directory)).toThrow(/HEAD or an available ancestor/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('deployment header and localhost readiness probes have finite request deadlines', async () => {
    const cloudflare = await readFile('.github/workflows/cloudflare-pages.yml', 'utf8');
    const mainline = await readFile('.github/workflows/main.yml', 'utf8');
    expect(cloudflare).toContain('--retry-all-errors --connect-timeout 10 --max-time 60');
    expect(mainline).toContain('--connect-timeout 2 --max-time 5 http://127.0.0.1:4173/app.html');
  });

  test('an ignored Vitest report leaves tracked drift clean in a fresh checkout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pendulum-drift-contract-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'ci@example.invalid');
      git('config', 'user.name', 'CI contract');
      await writeFile(join(directory, '.gitignore'), 'reports/vitest-results.json\n');
      await writeFile(join(directory, 'tracked.txt'), 'stable\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      await mkdir(join(directory, 'reports'));
      await writeFile(join(directory, 'reports', 'vitest-results.json'), '{}\n');
      expect(() => git('diff', '--exit-code')).not.toThrow();
      expect(() => git('restore', '--worktree', '--', 'reports/vitest-results.json')).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('mutation-runner isolation contract', () => {
  test.each(['stryker.config.json', 'stryker.shard.config.json'])(
    '%s uses the bounded mutation profile',
    async (name) => {
      const config = JSON.parse(await readFile(name, 'utf8')) as {
        vitest?: { configFile?: string; related?: boolean };
        ignorePatterns?: string[];
        mutate?: string[];
        dryRunTimeoutMinutes?: number;
        timeoutMS?: number;
        concurrency?: number;
      };
      expect(config.vitest).toEqual({ configFile: 'vitest.mutation.config.ts', related: true });
      expect(config.ignorePatterns).toContain('/wasm/assembly/**');
      expect(config.ignorePatterns).toContain('/tmp-trace-*/**');
      expect(config.ignorePatterns).toEqual(
        expect.arrayContaining(['/test-results/**', '/playwright-report/**', '/reports/**', '/coverage/**'])
      );
      expect(config.ignorePatterns).not.toContain('/tmp-trace-lab3d/**');
      expect(config.mutate).toEqual(
        expect.arrayContaining(['src/physics/stochastic.ts', 'src/physics/stochasticSteppers.ts'])
      );
      expect(config.mutate?.filter((target) => target === 'src/physics/stochasticSteppers.ts')).toHaveLength(1);
      expect(config.dryRunTimeoutMinutes).toBe(20);
      expect(config.timeoutMS).toBe(30_000);
      expect(config.concurrency).toBe(2);
    }
  );

  test('nightly mutation shards cover every stochastic stepper line exactly once', async () => {
    const workflow = await readFile('.github/workflows/nightly.yml', 'utf8');
    const stepper = await readFile('src/physics/stochasticSteppers.ts', 'utf8');
    const ranges = [...workflow.matchAll(/^\s+mutate: src\/physics\/stochasticSteppers\.ts:(\d+)-(\d+)\s*$/gm)].map(
      ([, start, end]) => [Number(start), Number(end)] as const
    );

    expect(workflow.match(/^\s+mutate: src\/physics\/stochastic\.ts\s*$/gm)).toHaveLength(1);
    expect(workflow).not.toMatch(/^\s+mutate: src\/physics\/stochasticSteppers\.ts\s*$/m);
    expect(ranges).toEqual([
      [1, 230],
      [231, 386],
      [387, 541],
      [542, 657]
    ]);
    expect(ranges[0]?.[0]).toBe(1);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.[0]).toBe((ranges[index - 1]?.[1] ?? 0) + 1);
    }
    expect(ranges.at(-1)?.[1]).toBe(stepper.trimEnd().split(/\r?\n/).length);
  });

  test('keeps the relaxed stochastic timeout out of the normal test profile', async () => {
    type TestProfile = {
      test?: {
        environment?: string;
        include?: string[];
        exclude?: string[];
        testTimeout?: number;
        hookTimeout?: number;
      };
    };
    const anchorPath = 'tests/stochastic-statistical-anchors.test.ts';
    const mutation = (await import('../vitest.mutation.config')).default as TestProfile;
    const normal = (await import('../vitest.config')).default as TestProfile;
    const quick = (await import('../vitest.quick.config')).default as TestProfile;
    const { SLOW_TEST_FILES } = await import('../vitest.tiers');
    const statisticalAnchors = await readFile('tests/stochastic-statistical-anchors.test.ts', 'utf8');
    const stepperContracts = await readFile('tests/stochastic.test.ts', 'utf8');

    expect(mutation.test).toMatchObject({
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: [anchorPath],
      testTimeout: 90_000,
      hookTimeout: 30_000
    });
    expect(mutation.test?.exclude).toEqual([anchorPath]);
    expect(normal.test?.include).toEqual(['tests/**/*.test.ts']);
    expect(normal.test?.exclude ?? []).not.toContain(anchorPath);
    expect(normal.test?.testTimeout).toBe(30_000);
    expect(SLOW_TEST_FILES.filter((file) => file === anchorPath)).toHaveLength(1);
    expect(quick.test?.exclude).toEqual([...SLOW_TEST_FILES]);
    expect(quick.test?.exclude?.filter((file) => file === anchorPath)).toHaveLength(1);
    expect(quick.test?.testTimeout).toBe(30_000);

    const anchorTitles = [
      'free Brownian motion has variance σ²·t',
      'Ornstein–Uhlenbeck relaxes the mean',
      'recovers the Geometric Brownian Motion moments',
      'commutative-milstein on diagonal GBM recovers the Itô moments',
      'heun-stratonovich with additive matrix noise reproduces Brownian variance'
    ];
    expect(statisticalAnchors.match(/\bit\(/g)).toHaveLength(5);
    expect(statisticalAnchors).not.toMatch(/\b(?:describe|it|test)\.concurrent\b/);
    for (const title of anchorTitles) {
      expect(statisticalAnchors).toContain(title);
      expect(stepperContracts).not.toContain(title);
    }
    expect(statisticalAnchors).toContain('realizations: 4000');
    expect(statisticalAnchors).toContain('realizations: 5000');
    expect(statisticalAnchors.match(/realizations: 8000/g)).toHaveLength(2);
    expect(stepperContracts).toContain('eulerMaruyamaStep with zero noise');
    expect(stepperContracts).toContain('milsteinStep with additive noise');
    expect(stepperContracts).toContain('stochasticHeunStratonovichStep(');
    expect(stepperContracts).toContain('commutativeMilsteinStep handles non-diagonal');
  });
});

describe('library build contract', () => {
  test('keeps conditional Node built-ins external instead of browser-shimming them', async () => {
    const source = await readFile('vite.config.lib.ts', 'utf8');
    expect(source).toContain('external: [/^node:/]');
  });
});

describe('secured dependency compatibility contract', () => {
  test('keeps native smoke coverage and the audited lint/CSS toolchain pins in the primary gate', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      engines: Record<string, string>;
      scripts: Record<string, string>;
      overrides: Record<string, string>;
      devDependencies: Record<string, string>;
      allowScripts: Record<string, boolean>;
    };
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as {
      packages: Record<
        string,
        {
          version?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        }
      >;
    };
    const eslintConfig = await readFile('eslint.config.js', 'utf8');

    expect(packageJson.engines.node).toBe('>=22 <27');
    expect(packageJson.devDependencies.eslint).toBe('10.8.0');
    expect(packageJson.devDependencies.postcss).toBe('8.5.23');
    expect(packageJson.devDependencies).not.toHaveProperty('eslint-plugin-import');
    expect(eslintConfig).not.toContain('eslint-plugin-import');
    expect(eslintConfig).not.toMatch(/\bimport:\s*importPlugin\b/);
    expect(lock.packages['']?.devDependencies?.eslint).toBe('10.8.0');
    expect(lock.packages['']?.devDependencies?.postcss).toBe('8.5.23');
    expect(lock.packages['node_modules/eslint']?.version).toBe('10.8.0');
    expect(lock.packages['node_modules/postcss']?.version).toBe('8.5.23');
    expect(lock.packages['node_modules/minimatch']?.version).toBe('10.2.5');
    expect(lock.packages['node_modules/brace-expansion']?.version).toBe('5.0.9');
    expect(lock.packages['node_modules/fast-uri']?.version).toBe('3.1.5');
    expect(lock.packages['node_modules/nanoid']?.version).toBe('3.3.18');
    expect(lock.packages['node_modules/undici']?.version).toBe('7.29.0');
    expect(Object.keys(lock.packages)).not.toContain('node_modules/eslint-plugin-import');

    expect(packageJson.overrides.sharp).toBe('0.35.3');
    expect(packageJson.overrides['brace-expansion']).toBe('5.0.9');
    expect(packageJson.overrides['fast-uri']).toBe('3.1.5');
    expect(packageJson.overrides.nanoid).toBe('3.3.18');
    expect(packageJson.overrides.undici).toBe('7.29.0');
    expect(packageJson.devDependencies.miniflare).toBe('4.20260721.0');
    expect(packageJson.devDependencies.sharp).toBe('0.35.3');
    expect(packageJson.allowScripts).toEqual({
      'esbuild@0.28.1': true,
      'workerd@1.20260721.1': true
    });
    expect(packageJson.scripts.verify).toContain('npm run smoke:miniflare-images');
    expect(packageJson.scripts['smoke:miniflare-images']).toBe('node scripts/miniflare-images-smoke.mjs');
  });
});

describe('production PWA policy contract', () => {
  test('standalone CSP relaxation accepts multiline tags and attribute whitespace', () => {
    const html = `<head>
      <meta name="description" content="keep me">
      <meta
        content="default-src 'self'; script-src 'self'"
        http-equiv = 'Content-Security-Policy'
      >
    </head>`;
    const transformed = relaxCspForFileProtocolHtml(html);

    expect(transformed).toContain('<meta name="description" content="keep me">');
    expect(transformed).toContain(`script-src 'self' 'unsafe-inline' blob:`);
    expect(transformed).toContain(`style-src 'self' 'unsafe-inline'`);
    expect(transformed.match(/Content-Security-Policy/gi)).toHaveLength(1);
  });

  test('sets isolation, CSP, permission, framing, transport, and cache headers', async () => {
    const headers = await readFile('public/_headers', 'utf8');
    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(headers).toContain("style-src 'self'");
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(headers).toContain('Origin-Agent-Cluster: ?1');
    expect(headers).toContain('geolocation=(), payment=(), usb=()');
    expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-cache, no-store, must-revalidate/);
    expect(headers).toMatch(/\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  test('keeps app, reviewer, deploy-header, and dev CSP directives at the same effective strength', async () => {
    const [app, reviewer, headers, vite] = await Promise.all([
      readFile('app.html', 'utf8'),
      readFile('reviewer.html', 'utf8'),
      readFile('public/_headers', 'utf8'),
      readFile('vite.config.ts', 'utf8')
    ]);
    const metaPolicy = (html: string): string => {
      const match = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"[^>]*>/i);
      if (!match?.[1]) throw new Error('missing meta Content-Security-Policy');
      return match[1];
    };
    const directives = (policy: string): Map<string, string> =>
      new Map(
        policy
          .split(';')
          .map((directive) => directive.trim())
          .filter(Boolean)
          .map((directive) => {
            const [name, ...values] = directive.split(/\s+/);
            return [name!, values.join(' ')];
          })
      );
    const headerPolicy = headers.match(/^\s*Content-Security-Policy:\s*([^\r\n]+)$/m)?.[1];
    expect(headerPolicy).toBeTruthy();
    const expected = new Map([
      ['default-src', "'self'"],
      ['script-src', "'self' 'wasm-unsafe-eval'"],
      ['style-src', "'self'"],
      ['img-src', "'self' data: blob:"],
      ['connect-src', "'self'"],
      ['worker-src', "'self'"],
      ['manifest-src', "'self'"],
      ['object-src', "'none'"],
      ['base-uri', "'self'"],
      ['form-action', "'self'"]
    ]);
    for (const policy of [metaPolicy(app), metaPolicy(reviewer), headerPolicy!]) {
      const actual = directives(policy);
      for (const [name, value] of expected) expect(actual.get(name), `${name} in ${policy}`).toBe(value);
    }
    expect(directives(headerPolicy!).get('frame-ancestors')).toBe("'none'");
    expect(vite).toContain("\"script-src 'self' 'wasm-unsafe-eval'\"");
    expect(vite).toContain('"style-src \'self\'"');
    expect(vite).toContain('"manifest-src \'self\'"');
    expect(vite).toContain('"form-action \'self\'"');
  });

  test('manifest declares deterministic launch behavior and display fallbacks', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8')) as Record<string, unknown>;
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui']);
    expect(manifest.orientation).toBe('any');
    expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-existing' });
  });

  test('service worker limits cache entries and bytes and isolates current cache generations', async () => {
    const source = await readFile('public/sw.js', 'utf8');
    expect(source).toContain('MAX_RUNTIME_RESPONSE_BYTES = 25 * 1024 * 1024');
    expect(source).toContain('response.status !== 200');
    expect(source).toContain("request.headers?.has?.('range')");
    expect(source).toContain("request.headers?.has?.('authorization')");
    expect(source).toContain("response.headers?.get?.('vary')");
    expect(source).toContain('trimQueue.catch(() => undefined)');
    expect(source).toContain('matchCurrentCaches');
    expect(source).toContain('matchRetainedPreviousCaches');
    expect(source).toContain('matchAvailableCaches');
    expect(source).not.toContain('const outcome = caches.match(request)');
  });
});
