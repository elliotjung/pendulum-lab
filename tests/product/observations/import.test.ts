import { describe, expect, it } from 'vitest';
import { parseObservedDoublePendulumCsv } from '../../../src/research/experimentalDataImport';
import {
  confirmObservationImport,
  inspectObservationData,
  parseObservationArtifact,
  previewObservationImport,
  serializeObservationArtifact,
  toDoublePendulumObservation,
  validateObservationArtifact,
  OBSERVATION_LIMITS,
  type ObservationImportRequest
} from '../../../src/product/observations';

const request = (text = 'time,theta1,theta2\n0,10,20\n0.1,11,21'): ObservationImportRequest => ({
  text,
  name: 'observed.csv',
  kind: 'csv',
  mapping: { time: 'time', theta1: 'theta1', theta2: 'theta2' }
});

describe('S22 immutable observation preview and confirmation', () => {
  it('preserves exact original, stays in preview and freezes every branch', async () => {
    const input = request();
    const preview = await previewObservationImport(input);
    expect(preview.stage).toBe('preview');
    expect(preview.summary).toEqual({ sourceRows: 2, acceptedRows: 2, channels: 2, durationSeconds: 0.1 });
    const artifact = confirmObservationImport(preview);
    expect(artifact.original.text).toBe(input.text);
    expect(artifact.original.sha256).toMatch(/^[a-f0-9]{64}$/u);
    for (const value of [
      artifact,
      artifact.original,
      artifact.transform,
      artifact.transform.options,
      artifact.data,
      artifact.data.angles,
      artifact.data.angles[0]
    ])
      expect(Object.isFrozen(value)).toBe(true);
    input.mapping.time = 'mutated';
    expect(artifact.transform.mapping.time).toBe('time');
    expect(() => {
      (artifact.data.times as number[])[0] = 10;
    }).toThrow();
  });

  it('cannot confirm a fabricated preview', () => {
    expect(() => confirmObservationImport({ stage: 'preview' } as never)).toThrow(/미리보기/u);
  });

  it('applies declared time/unit/calibration and matches native CSV angle conversion exactly', async () => {
    const input = request('ms,a,b\n1000,90,-90\n1100,180,45');
    input.mapping = { time: 'ms', theta1: 'a', theta2: 'b' };
    input.options = {
      timeUnit: 'ms',
      angleUnit: 'deg',
      timeOffset: -1,
      timeScale: 1,
      angleScale: [2, -1],
      angleOffset: [0.1, 0.2]
    };
    const { artifact } = await previewObservationImport(input);
    const native = parseObservedDoublePendulumCsv('time,theta1,theta2\n0,90,-90\n0.1,180,45', { angleUnit: 'degree' });
    expect(artifact.data.times[0]).toBe(0);
    expect(artifact.data.times[1]).toBeCloseTo(0.1, 15);
    expect(artifact.data.angles).toEqual(native.angles.map(([a, b]) => [a * 2 + 0.1, -b + 0.2]));
    expect(artifact.transform.history.join('\n')).toContain('ms->s;scale=1;offset=-1');
  });

  it('imports a single measured sensor channel without inventing a second one', async () => {
    const { artifact } = await previewObservationImport({
      text: 'timestamp,angle\n0,10\n100,20',
      name: 'imu.csv',
      kind: 'sensor',
      mapping: { time: 'timestamp', theta1: 'angle' },
      options: { timeUnit: 'ms', angleUnit: 'deg' }
    });
    expect(artifact.data.angles[1]).toEqual([(20 * Math.PI) / 180]);
    expect(() => toDoublePendulumObservation(artifact)).toThrow(/두 각도/u);
    expect(artifact.warnings.join()).toContain('단일 센서');
    const nativeCopy = await parseObservationArtifact(serializeObservationArtifact(artifact));
    expect(nativeCopy).toEqual(artifact);
  });

  it('returns independent mutable copies at the native fitting boundary', async () => {
    const { artifact } = await previewObservationImport(request());
    const native = toDoublePendulumObservation(artifact);
    (native.times as number[])[0] = 99;
    expect(artifact.data.times[0]).toBe(0);
  });

  it('position coordinates use native geometry, preserve pivot/unit and never infer lengths', async () => {
    const input: ObservationImportRequest = {
      text: 't,x1,y1,x2,y2\n0,10,30,30,30\n0.1,20,20,20,40',
      name: 'markers.csv',
      kind: 'csv',
      mapping: { time: 't', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2' },
      options: { coordinateUnit: 'px', pixelsPerMeter: 10, pivot: { x: 10, y: 10 }, yAxis: 'down' }
    };
    const { artifact } = await previewObservationImport(input);
    const native = parseObservedDoublePendulumCsv(input.text.replace('t,', 'time,'), {
      pivot: { x: 10, y: 10 },
      yAxis: 'down'
    });
    expect(artifact.data.angles).toEqual(native.angles);
    expect(artifact.transform.options.pixelsPerMeter).toBe(10);
    expect(artifact.transform.history.join()).toContain('px/m=10');
    expect(artifact.data).not.toHaveProperty('lengths');
  });

  it('supports image y-up and centimeter input with matching angular sign', async () => {
    const input: ObservationImportRequest = {
      text: 't,x1,y1,x2,y2\n0,1,-1,2,-1\n1,1,-1,2,-1',
      name: 'coordinates.csv',
      kind: 'csv',
      mapping: { time: 't', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2' },
      options: { coordinateUnit: 'cm', yAxis: 'up' }
    };
    const { artifact } = await previewObservationImport(input);
    expect(artifact.data.angles[0]).toEqual([Math.PI / 4, Math.PI / 2]);
  });

  it.each(['0,0,0,0,1', '0,0,1,0,1'])('rejects degenerate marker geometry %s', async (row) => {
    const input: ObservationImportRequest = {
      text: `t,x1,y1,x2,y2\n${row}\n1,0,1,0,2`,
      name: 'bad.csv',
      kind: 'csv',
      mapping: { time: 't', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2' }
    };
    await expect(previewObservationImport(input)).rejects.toThrow(/マーカー|마커/u);
  });

  it('replays originals and preserves all lineage on file round trip', async () => {
    const { artifact } = await previewObservationImport(request());
    expect(await parseObservationArtifact(serializeObservationArtifact(artifact))).toEqual(artifact);
    expect(await validateObservationArtifact(artifact)).toEqual(artifact);
  });

  it('accepts harmless object-key reordering without changing identity', async () => {
    const { artifact } = await previewObservationImport(request());
    const reorder = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map(reorder);
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, item]) => [key, reorder(item)])
      );
    };
    expect(await validateObservationArtifact(reorder(artifact))).toEqual(artifact);
  });

  it.each(['original-text', 'hash', 'data', 'history', 'schema', 'extra'])('rejects changed %s', async (change) => {
    const data = JSON.parse(serializeObservationArtifact((await previewObservationImport(request())).artifact));
    if (change === 'original-text') data.original.text = data.original.text.replace('10,20', '12,20');
    if (change === 'hash') data.original.sha256 = '0'.repeat(64);
    if (change === 'data') data.data.angles[0][0] = 8;
    if (change === 'history') data.transform.history.push('fabricated');
    if (change === 'schema') data.schema = 'future/v2';
    if (change === 'extra') data.silentExtra = true;
    await expect(validateObservationArtifact(data)).rejects.toThrow();
  });
});

describe('S22 missing-data transformations', () => {
  const text = 'time,theta1,theta2\n0,0,0\n0.1,,10\n0.2,20,20';
  it('rejects missing values by default', async () => {
    await expect(previewObservationImport(request(text))).rejects.toThrow(/결측값/u);
  });
  it('drops whole rows with an explicit count and leaves original bytes intact', async () => {
    const input = request(text);
    input.options = { missing: 'drop' };
    const { artifact } = await previewObservationImport(input);
    expect(artifact.data.times).toEqual([0, 0.2]);
    expect(artifact.transform.droppedRows).toBe(1);
    expect(artifact.original.text).toBe(text);
  });
  it('interpolates at actual irregular times and preserves raw source', async () => {
    const input = request('time,theta1,theta2\n0,0,0\n0.05,,5\n0.2,20,20');
    input.options = { missing: 'interpolate', maxGapSeconds: 0.25 };
    const { artifact } = await previewObservationImport(input);
    expect(artifact.data.angles[1]).toEqual([5, 5]);
    expect(artifact.transform.interpolatedValues).toBe(1);
    expect(artifact.warnings.join()).toContain('래핑 경계');
    expect((await parseObservationArtifact(serializeObservationArtifact(artifact))).id).toBe(artifact.id);
  });
  it.each([
    ['boundary', 'time,theta1,theta2\n0,,0\n0.2,20,20'],
    ['gap', 'time,theta1,theta2\n0,0,0\n0.5,,5\n1,20,20'],
    ['time', 'time,theta1,theta2\n,0,0\n1,20,20']
  ])('refuses %s interpolation', async (_label, inputText) => {
    const input = request(inputText);
    input.options = { missing: 'interpolate', maxGapSeconds: 0.25 };
    await expect(previewObservationImport(input)).rejects.toThrow();
  });
});

describe('S22 malicious and malformed observation boundaries', () => {
  it.each([
    'time,theta1,theta2\n0,=SUM(1),0\n1,1,2',
    'time,theta1,theta2\n0,@cmd,0\n1,1,2',
    'time,theta1,theta2\n0,+1+2,0\n1,1,2',
    'time,theta1,theta2\n0,Infinity,0\n1,1,2',
    'time,theta1,theta2\n0,NaN,0\n1,1,2',
    'time,theta1,theta2\n0,0x12,0\n1,1,2',
    'time,theta1,theta2\n0,1e999,0\n1,1,2',
    'time,theta1,theta2\n0,1e13,0\n1,1,2',
    'time,theta1,theta2\n0,"2,0\n1,1,2',
    'time,theta1,theta2\n0,2"3,0\n1,1,2',
    'time,theta1,theta2\n0,1\n1,1,2',
    'time,theta1,theta2\n0,1,2,3\n1,1,2',
    'time,theta1,theta2\n0,1,2\n\n1,1,2',
    'time,theta1,theta2\n0,1,2\n0,1,2',
    'time,theta1,theta2\n1,1,2\n0,1,2',
    'time,theta1,theta2\n-1,1,2\n0,1,2',
    'time,theta1,theta2\n0,1,2\n3601,1,2',
    'time,theta1,theta1\n0,1,2\n1,1,2',
    'time,theta1,constructor\n0,1,2\n1,1,2',
    'time,theta1,theta2\n0,1\u0000,2\n1,1,2'
  ])('rejects malformed/formula/source %s', async (text) => {
    await expect(previewObservationImport(request(text))).rejects.toThrow();
  });

  it('allows signed decimal numeric values and strict quoted cells', async () => {
    const { artifact } = await previewObservationImport(request('"time","theta1","theta2"\n0,-1.2,+2.3e-1\n1,.2,1.'));
    expect(artifact.data.angles[0]).toEqual([-1.2, 0.23]);
  });

  it.each(['../data.csv', 'a/b.csv', 'a\\b.csv', 'C:data.csv', 'bad\n.csv', '..'])(
    'rejects path-like filename %s',
    async (name) => {
      const input = request();
      input.name = name;
      await expect(previewObservationImport(input)).rejects.toThrow(/파일명/u);
    }
  );

  it.each([
    { timeScale: 0 },
    { timeScale: Infinity },
    { timeOffset: Infinity },
    { angleScale: [0, 1] },
    { angleOffset: [NaN, 0] },
    { pixelsPerMeter: 0 },
    { maxGapSeconds: 0 },
    { timeUnit: 'minutes' },
    { angleUnit: 'turns' },
    { missing: 'fill-zero' },
    { sneaky: true },
    { pivot: { x: 0 } }
  ])('rejects invalid calibration %j', async (options) => {
    await expect(previewObservationImport({ ...request(), options } as ObservationImportRequest)).rejects.toThrow();
  });

  it('rejects oversized text and excess rows before any fitting', async () => {
    await expect(previewObservationImport(request(' '.repeat(OBSERVATION_LIMITS.textBytes + 1)))).rejects.toThrow(
      /MiB/u
    );
    const text = [
      'time,theta1,theta2',
      ...Array.from({ length: OBSERVATION_LIMITS.rows + 1 }, (_, i) => `${i / 100},0,0`)
    ].join('\n');
    await expect(previewObservationImport(request(text))).rejects.toThrow(/4096/u);
  });

  it('rejects prototype pollution, accessors, inherited objects, cycles and sparse arrays', () => {
    let calls = 0;
    const getter = {
      get text() {
        calls += 1;
        return 'secret';
      }
    };
    const cycle: Record<string, unknown> = {};
    cycle.value = cycle;
    for (const value of [JSON.parse('{"__proto__":{"polluted":true}}'), getter, new Date(), cycle, new Array(3)])
      expect(() => inspectObservationData(value)).toThrow();
    expect(calls).toBe(0);
    expect({}).not.toHaveProperty('polluted');
  });

  it('does not silently treat a relabelled CSV as retained original video', async () => {
    await expect(previewObservationImport({ ...request(), kind: 'video' })).rejects.toThrow(/원본 영상/u);
    await expect(
      previewObservationImport({
        ...request(),
        kind: 'video',
        capture: {},
        media: { name: 'fake.mp4', mime: 'video/mp4', base64: btoa('<script>evil</script>') }
      })
    ).rejects.toThrow(/서명/u);
  });
});
