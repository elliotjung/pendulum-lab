import type { LearningData } from '../../../../src/product/adapters/analysis/data-driven/learning-contracts';
import { learningDefaults } from '../../../../src/product/adapters/analysis/data-driven/learning-contracts';
import type { DataDrivenRequest } from '../../../../src/product/adapters/analysis/data-driven/contracts';

export function oscillatorData(): LearningData {
  const times = Array.from({ length: 160 }, (_, i) => i * 0.02);
  return {
    times,
    values: times.map((t) => [Math.cos(2 * t), t === 0 ? 0 : -2 * Math.sin(2 * t)]),
    labels: ['q0', 'p0'],
    units: ['1', '1'],
    axisUnit: 'normalized-time',
    provenance: { kind: 'analytic-test', canonical: true, coordinateOrder: 'q,p', canonicalUnits: ['1', '1'] }
  };
}
export function modelRequest(): DataDrivenRequest {
  const data = oscillatorData();
  return {
    schema: 'pendulum-data-driven-request/v1',
    id: 'worker-test',
    mode: 'train',
    input: { kind: 'learning', data, settings: learningDefaults(data, 'dmd') }
  };
}
