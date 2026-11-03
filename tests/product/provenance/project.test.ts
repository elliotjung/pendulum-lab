import { describe, expect, it } from 'vitest';
import { textToBytes } from '../../../src/research/zipBundle';
import {
  createResearchProject,
  captureResearchRun,
  addResearchArtifact,
  readResearchArtifact,
  verifyResearchBundle
} from '../../../src/product/provenance/project';
import {
  safeResearchPath,
  validateResearchProject,
  validateResearchSeriesDocument
} from '../../../src/product/provenance/validation';
import { runDataDriven } from '../../../src/product/adapters/analysis/data-driven/execute';
import { modelRequest } from '../analysis/data-driven/fixtures';
import { previewObservationImport } from '../../../src/product/observations/artifact';
import { bundleFixture, emptyFixture, nativeFixture } from './fixtures';

describe('S24 project hierarchy and immutable original artifacts', () => {
  it('captures detached canonical input and actual native series with source/units/seed intact', async () => {
    const input = nativeFixture(),
      original = emptyFixture();
    const bundle = await captureResearchRun(original, {
      experiment: input.experiment,
      series: input.series,
      label: 'run',
      sessionId: 'session-test'
    });
    expect(original.project.runs).toHaveLength(0);
    expect(bundle.project.runs[0]!.status).toBe('completed');
    expect(bundle.project.artifacts.map((artifact) => artifact.kind)).toEqual(['configuration', 'series']);
    const series = validateResearchSeriesDocument(readResearchArtifact(bundle, bundle.project.artifacts[1]!.id));
    expect(series.series).toEqual(input.series);
    expect(series.experiment).toEqual(input.experiment);
    input.series.states[0]![0] = 99;
    expect(
      validateResearchSeriesDocument(readResearchArtifact(bundle, bundle.project.artifacts[1]!.id)).series.states[0]![0]
    ).not.toBe(99);
    expect(await verifyResearchBundle(bundle)).toEqual(bundle);
  });
  it('records config-only capture as partial and refuses fabricated completed status', async () => {
    const bundle = await bundleFixture(false);
    expect(bundle.project.runs[0]!.status).toBe('partial');
    expect(bundle.project.runs[0]!.note).toContain('설정만');
    await expect(
      captureResearchRun(emptyFixture(), {
        experiment: nativeFixture().experiment,
        label: 'invented',
        sessionId: 'session-test',
        status: 'completed'
      })
    ).rejects.toThrow(/표본/);
  });
  it('records paused, initial-only and retained-tail series as partial rather than completed runs', async () => {
    for (const mode of ['paused', 'initial', 'tail']) {
      const native = nativeFixture();
      const indices =
        mode === 'initial'
          ? [0]
          : mode === 'paused'
            ? [0, 1, 2]
            : [native.series.times.length - 2, native.series.times.length - 1];
      const series = {
        ...native.series,
        times: indices.map((i) => native.series.times[i]!),
        states: indices.map((i) => native.series.states[i]!),
        ...(native.series.energy ? { energy: indices.map((i) => native.series.energy![i]!) } : {})
      };
      const options = { experiment: native.experiment, series, label: mode, sessionId: 'session-test' };
      expect((await captureResearchRun(emptyFixture(), options)).project.runs[0]!.status).toBe('partial');
      await expect(captureResearchRun(emptyFixture(), { ...options, status: 'completed' })).rejects.toThrow(
        /終了|종료/
      );
    }
  });
  it('keeps native file whitespace/bytes and native run identity while validating the original parser', async () => {
    const fixture = nativeFixture(),
      first = await bundleFixture();
    const bundle = await addResearchArtifact(first, {
      runId: 'run-test',
      filename: '원본 결과.json',
      data: fixture.bytes
    });
    const artifact = bundle.project.artifacts.at(-1)!;
    expect(artifact).toMatchObject({
      kind: 'core',
      nativeId: 'native-core-artifact',
      nativeInputRunId: 'native-core-run'
    });
    expect(bundle.files.at(-1)!.data).toEqual(fixture.bytes);
    fixture.bytes[0] = 0;
    expect(bundle.files.at(-1)!.data[0]).toBe(32);
    expect((await verifyResearchBundle(bundle)).files.at(-1)!.data).toEqual(bundle.files.at(-1)!.data);
  });
  it('retains/revalidates the S23 fitted model, training data and SHA256 lineage', async () => {
    const model = await runDataDriven(modelRequest()),
      bytes = textToBytes(JSON.stringify(model, null, 1));
    const bundle = await addResearchArtifact(await bundleFixture(), {
      runId: 'run-test',
      filename: 'model.json',
      data: bytes
    });
    expect(bundle.project.artifacts.at(-1)!.kind).toBe('data-driven');
    expect(readResearchArtifact(await verifyResearchBundle(bundle), bundle.project.artifacts.at(-1)!.id)).toEqual(
      model
    );
    expect(bundle.files.at(-1)!.data).toEqual(bytes);
  });
  it('preserves observation original text and transformation history', async () => {
    const preview = await previewObservationImport({
      name: 'angles.csv',
      kind: 'csv',
      text: 't,a,b\n0,1,2\n0.1,2,3\n0.2,3,4\n',
      mapping: { time: 't', theta1: 'a', theta2: 'b' }
    });
    const bytes = textToBytes(JSON.stringify(preview.artifact));
    const bundle = await addResearchArtifact(await bundleFixture(), {
      runId: 'run-test',
      filename: 'observation.json',
      data: bytes
    });
    expect(readResearchArtifact(await verifyResearchBundle(bundle), bundle.project.artifacts.at(-1)!.id)).toEqual(
      preview.artifact
    );
  });
  it.each([
    'pendulum-core-diagnostic/v1',
    'pendulum-advanced-diagnostic/v1',
    'pendulum-stability-workflow/v1',
    'pendulum-batch/v1',
    'pendulum-inverse-result/v1',
    'pendulum-data-driven-result/v1',
    'pendulum-observation/v1'
  ])('refuses malformed native %s rather than accepting an unverified named result', async (schema) => {
    await expect(
      addResearchArtifact(await bundleFixture(), {
        runId: 'run-test',
        filename: 'bad.json',
        data: textToBytes(JSON.stringify({ schema }))
      })
    ).rejects.toThrow();
  });
  it('refuses native artifact association with another canonical experiment', async () => {
    const first = await bundleFixture(),
      fixture = nativeFixture();
    first.project.runs[0]!.experiment = {
      ...fixture.experiment,
      seed: { value: 'different', generator: 'test', generatorVersion: '1' }
    };
    await expect(
      addResearchArtifact(first, { runId: 'run-test', filename: 'wrong.json', data: fixture.bytes })
    ).rejects.toThrow(/다릅니다/);
  });
  it('rejects modified bytes and present files that went missing', async () => {
    const bundle = await bundleFixture();
    bundle.files[0]!.data[0] = 32;
    await expect(verifyResearchBundle(bundle)).rejects.toThrow(/checksum/);
    const missing = await bundleFixture();
    missing.files.pop();
    await expect(verifyResearchBundle(missing)).rejects.toThrow(/목록/);
  });
  it('allows explicit unavailable artifacts with a reason while retaining their known identity', async () => {
    const bundle = await bundleFixture(),
      artifact = bundle.project.artifacts[1]!;
    artifact.status = 'missing';
    artifact.note = '원본 파일을 전달받지 못했습니다.';
    bundle.files.pop();
    expect((await verifyResearchBundle(bundle)).project.artifacts[1]!.status).toBe('missing');
    artifact.note = '';
    expect(() => validateResearchProject(bundle.project)).toThrow(/사유/);
  });
  it('rejects duplicate IDs, broken bidirectional references, cycles and unregistered paths', async () => {
    const original = await bundleFixture();
    for (const mutate of [
      (b: typeof original) => {
        b.project.artifacts[0]!.id = b.project.runs[0]!.id;
      },
      (b: typeof original) => {
        b.project.runs[0]!.artifactIds = [];
      },
      (b: typeof original) => {
        b.project.artifacts[0]!.parentIds = [b.project.artifacts[1]!.id];
      },
      (b: typeof original) => {
        b.project.artifacts[0]!.parentIds = ['absent'];
      },
      (b: typeof original) => {
        b.project.artifacts[0]!.path = 'manifest/project.json';
      },
      (b: typeof original) => {
        b.project.runs[0]!.sessionId = 'absent';
      }
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      await expect(verifyResearchBundle(changed)).rejects.toThrow();
    }
  });
  it('checks figure run, source and actual coordinate dimension', async () => {
    const bundle = await bundleFixture(),
      source = bundle.project.artifacts[1]!;
    bundle.project.figures.push({
      id: 'figure-test',
      title: '각도',
      caption: '원본 기록',
      runId: source.runId,
      sourceArtifactId: source.id,
      xColumn: -1,
      yColumn: 0,
      theme: 'print'
    });
    expect(await verifyResearchBundle(bundle)).toEqual(bundle);
    bundle.project.figures[0]!.yColumn = 999;
    await expect(verifyResearchBundle(bundle)).rejects.toThrow(/좌표/);
    bundle.project.figures[0]!.yColumn = 0;
    bundle.project.figures[0]!.runId = 'other';
    expect(() => validateResearchProject(bundle.project)).toThrow(/원 run/);
  });
  it('rejects getters/prototype payloads without invoking the getter', () => {
    let called = false;
    const project = createResearchProject({ title: 'safe' }).project;
    Object.defineProperty(project, 'title', {
      enumerable: true,
      get() {
        called = true;
        return 'unsafe';
      }
    });
    expect(() => validateResearchProject(project)).toThrow();
    expect(called).toBe(false);
    expect(() => validateResearchProject(JSON.parse('{"__proto__":{}}'))).toThrow();
  });
  it.each([
    '../x',
    '/x',
    'C:/x',
    'a\\x',
    'a:b',
    'x/../y',
    'a//b',
    'aux.txt',
    'a/CON',
    'a/end.',
    'a/end ',
    'a/%2e%2e/y'
  ])('rejects unsafe portable archive path %s', (path) => expect(() => safeResearchPath(path)).toThrow());
  it('rejects malformed series time order and unit dimensions', () => {
    const fixture = nativeFixture(),
      document = { schema: 'pendulum-project-series/v1', experiment: fixture.experiment, series: fixture.series };
    fixture.series.times[1] = fixture.series.times[0]!;
    expect(() => validateResearchSeriesDocument(document)).toThrow();
    fixture.series.times[1] = 0.01;
    fixture.series.units.pop();
    expect(() => validateResearchSeriesDocument(document)).toThrow();
  });
  it('rejects coordinate, physical unit and axis relabelling against the original adapter', () => {
    for (const mutate of [
      (series: ReturnType<typeof nativeFixture>['series']) => {
        series.labels[0] = 'momentum';
      },
      (series: ReturnType<typeof nativeFixture>['series']) => {
        series.units[0] = 'kg';
      },
      (series: ReturnType<typeof nativeFixture>['series']) => {
        series.axisUnit = 'iteration';
      }
    ]) {
      const native = nativeFixture();
      mutate(native.series);
      expect(() =>
        validateResearchSeriesDocument({
          schema: 'pendulum-project-series/v1',
          experiment: native.experiment,
          series: native.series
        })
      ).toThrow(/원본 adapter/);
    }
  });
});
