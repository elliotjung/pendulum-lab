import { describe, expect, test } from 'vitest';
import {
  EXPANSION_MODEL_IDS,
  EXPANSION_PRESETS,
  GOLDEN_REGRESSION_BASELINES,
  buildExpansionReport,
  configFromPreset,
  parseExpansionShareHash,
  runExpansionBatch,
  runGoldenExpansionCenter,
  runGoldenExpansionChecks,
  runResearchMatrixStudy,
  runExpansionSuite,
  stableExperimentHash,
  type ExpansionModelId
} from '../src/physics/expandedModels';

describe('expanded physics model suite', () => {
  test('covers the requested expansion families', () => {
    expect(EXPANSION_MODEL_IDS).toEqual([
      'driven',
      'coupled',
      'inverted',
      'cartpole',
      'parametric',
      'spherical',
      'chain'
    ]);
  });

  test.each(EXPANSION_MODEL_IDS)(
    'runs %s with integrator comparison and visual analysis artifacts',
    (model: ExpansionModelId) => {
      const result = runExpansionSuite({
        model,
        methods: ['rk4', 'symplectic'],
        horizon: model === 'chain' ? 2 : 3,
        sampleLimit: 48,
        bifurcationColumns: 5
      });
      expect(result.model).toBe(model);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((row) => row.completedSteps > 0)).toBe(true);
      expect(result.phaseHeatmap.maxCount).toBeGreaterThan(0);
      expect(result.ghost.length).toBeGreaterThan(2);
      expect(result.bifurcation).toHaveLength(5);
      expect(result.replay.length).toBeGreaterThan(2);
      expect(result.manifest.hash).toMatch(/^exp-[0-9a-f]{8}$/);
    }
  );

  test('rk4 is a stronger conservative baseline than explicit Euler on coupled pendulums', () => {
    const result = runExpansionSuite({
      model: 'coupled',
      methods: ['rk4', 'euler'],
      horizon: 8,
      dt: 0.005,
      sampleLimit: 64,
      bifurcationColumns: 4
    });
    const rk4 = result.rows.find((row) => row.method === 'rk4');
    const euler = result.rows.find((row) => row.method === 'euler');
    expect(rk4?.stable).toBe(true);
    expect(euler?.stable).toBe(true);
    expect(rk4?.energyDrift ?? Infinity).toBeLessThan(euler?.energyDrift ?? 0);
  });

  test('experiment hash is stable for structured payloads', () => {
    const a = stableExperimentHash({ model: 'cartpole', params: { force: 1, length: 0.7 }, methods: ['rk4', 'euler'] });
    const b = stableExperimentHash({ methods: ['rk4', 'euler'], params: { length: 0.7, force: 1 }, model: 'cartpole' });
    expect(a).toBe(b);
  });

  test('presets can be cloned into independent configs', () => {
    expect(EXPANSION_PRESETS.length).toBeGreaterThanOrEqual(EXPANSION_MODEL_IDS.length);
    const config = configFromPreset('cartpole-open-loop');
    expect(config.model).toBe('cartpole');
    expect(config.parameterOverrides?.force).toBe(0.5);
  });

  test('share hashes round-trip expansion configs', () => {
    const result = runExpansionSuite({
      model: 'parametric',
      methods: ['rk4'],
      horizon: 3,
      parameterOverrides: { amplitude: 0.42 }
    });
    const parsed = parseExpansionShareHash(result.manifest.shareHash);
    expect(parsed?.model).toBe('parametric');
    expect(parsed?.parameterOverrides?.amplitude).toBe(0.42);
  });

  test('markdown report includes reproducibility and caveats', () => {
    const result = runExpansionSuite({
      model: 'spherical',
      methods: ['rk4'],
      horizon: 3,
      sampleLimit: 32,
      bifurcationColumns: 4
    });
    const report = buildExpansionReport(result);
    expect(report).toContain('Pendulum Expansion Report');
    expect(report).toContain(result.manifest.hash);
    expect(report).toContain('Caveat');
    expect(report).toContain('share: #expansion=');
  });

  test('golden checks and preset batch produce reproducible summaries', () => {
    const golden = runGoldenExpansionChecks(['coupled-normal-mode']);
    expect(golden).toHaveLength(1);
    expect(golden[0]?.hash).toMatch(/^exp-[0-9a-f]{8}$/);
    const batch = runExpansionBatch(['driven-chaos', 'cartpole-open-loop']);
    expect(batch).toHaveLength(2);
    expect(batch.every((item) => item.result.rows.length === 3)).toBe(true);
  });

  test('research matrix builds comparison, 2D sweep, units, and chaos diagnostics', () => {
    const matrix = runResearchMatrixStudy(
      {
        model: 'driven',
        methods: ['rk4', 'symplectic'],
        horizon: 3,
        dt: 0.012,
        parameterOverrides: { driveAmplitude: 1.1 },
        sampleLimit: 48,
        bifurcationColumns: 4
      },
      { gridSize: 4 }
    );
    expect(matrix.schemaVersion).toBe('pendulum-research-matrix/v1');
    expect(matrix.comparison.some((row) => row.kind === 'integrator')).toBe(true);
    expect(matrix.comparison.some((row) => row.kind === 'parameter')).toBe(true);
    expect(matrix.sweep2d.cells).toHaveLength(16);
    expect(matrix.physicalMetrics.some((metric) => metric.id === 'dt-star')).toBe(true);
    expect(matrix.diagnostics.lyapunovTimeline.length).toBeGreaterThan(2);
    expect(matrix.diagnostics.basin.cells).toHaveLength(25);
    expect(matrix.diagnostics.energyLandscape.cells.length).toBeGreaterThan(16);
    expect(matrix.manifest.hash).toMatch(/^exp-[0-9a-f]{8}$/);
  });

  test('chain research matrix uses a real link-length scale axis', () => {
    const matrix = runResearchMatrixStudy(
      {
        model: 'chain',
        methods: ['rk4'],
        horizon: 2,
        dt: 0.004,
        sampleLimit: 32,
        bifurcationColumns: 4
      },
      { gridSize: 4 }
    );
    expect(matrix.sweep2d.yAxis.parameter).toBe('lengthScale');
    expect(matrix.sweep2d.yAxis.label).toContain('link length');
    const firstColumn = matrix.sweep2d.cells.filter((_, index) => index % matrix.sweep2d.size === 0);
    const yValues = firstColumn.map((cell) => cell.y);
    expect(new Set(yValues.map((value) => value.toFixed(6))).size).toBe(matrix.sweep2d.size);
    expect(Math.min(...yValues)).toBeCloseTo(matrix.sweep2d.yAxis.min, 6);
    expect(Math.max(...yValues)).toBeCloseTo(matrix.sweep2d.yAxis.max, 6);
  });

  test('energy landscape carries a caveat for driven or dissipative models', () => {
    const matrix = runResearchMatrixStudy(
      {
        model: 'driven',
        methods: ['rk4'],
        horizon: 2,
        dt: 0.012,
        sampleLimit: 32,
        bifurcationColumns: 4
      },
      { gridSize: 4 }
    );
    expect(matrix.diagnostics.energyLandscape.note).toContain('not a true separatrix');
  });

  test('golden center separates integrator thresholds and regression signatures', () => {
    const center = runGoldenExpansionCenter(['coupled-normal-mode'], ['rk4', 'euler']);
    expect(center.schemaVersion).toBe('pendulum-golden-center/v1');
    expect(center.presets).toHaveLength(1);
    expect(center.summary.totalMethods).toBe(2);
    expect(center.presets[0]?.methods.every((row) => row.regressionHash.match(/^exp-[0-9a-f]{8}$/))).toBe(true);
    expect(center.presets[0]?.methods[0]?.expectedRegressionHash).toBe(
      GOLDEN_REGRESSION_BASELINES['coupled-normal-mode']?.rk4
    );
    expect(center.presets[0]?.methods.every((row) => row.regressionPass)).toBe(true);
    expect(center.manifest.hash).toMatch(/^exp-[0-9a-f]{8}$/);
  });
});
