import { describe, expect, it } from 'vitest';
import { parseObservedDoublePendulumCsv } from '../src/research/experimentalDataImport';

describe('experimental data CSV import', () => {
  it('parses angle CSV data and converts degrees to radians', () => {
    const observation = parseObservedDoublePendulumCsv('time,theta1,theta2\n0,90,0\n0.1,45,-45\n', {
      angleUnit: 'degree'
    });
    expect(observation.times).toEqual([0, 0.1]);
    expect(observation.angles[0]![0]).toBeCloseTo(Math.PI / 2);
    expect(observation.angles[1]![1]).toBeCloseTo(-Math.PI / 4);
  });

  it('converts video-tracked bob coordinates into relative pendulum angles', () => {
    const observation = parseObservedDoublePendulumCsv('t,x1,y1,x2,y2\n0,0,1,1,1\n0.2,1,0,1,1\n');
    expect(observation.angles[0]![0]).toBeCloseTo(0);
    expect(observation.angles[0]![1]).toBeCloseTo(Math.PI / 2);
    expect(observation.angles[1]![0]).toBeCloseTo(Math.PI / 2);
    expect(observation.angles[1]![1]).toBeCloseTo(0);
  });

  it('rejects non-monotone sample times', () => {
    expect(() => parseObservedDoublePendulumCsv('time,theta1,theta2\n0,0,0\n0,0,0\n')).toThrow(/strictly increasing/);
  });
});
