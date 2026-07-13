import { describe, expect, it } from 'vitest';
import {
  buildFlagshipFigureSvg,
  certifyFlagshipGapMap,
  estimateFlagshipCrossing,
  flagshipCertifiedRows,
  refinedFlagshipGrid,
  type FlagshipPaperStudyReport
} from '../src/research/flagshipCertification';

const fixture: FlagshipPaperStudyReport = {
  driveFrequency: 2 / 3,
  dt: 0.005,
  dtSensitivity: { gamma: 0.5, dtFine: 0.0025, ApdFine: 1.06637, ApdCoarse: 1.06638, absDelta: 1e-5 },
  measurements: [
    {
      gamma: 0.6,
      Ac: 1.2,
      Apd: 1.224,
      ratio: 1.02,
      attractorBracket: [1.2239, 1.2241],
      lossType: 'period-doubling',
      rhoBelow: -0.93,
      rhoAbove: -1.07,
      K_below: 0.02,
      K_above: 0.98
    },
    {
      gamma: 0.7,
      Ac: 1.4,
      Apd: 1.386,
      ratio: 0.99,
      attractorBracket: [1.3858, 1.3862],
      lossType: 'period-doubling',
      rhoBelow: -0.94,
      rhoAbove: -1.06,
      K_below: 0.02,
      K_above: 0.1
    }
  ]
};

describe('flagship certification', () => {
  it('builds onset rows with uncertainty and caveat metadata', () => {
    const rows = flagshipCertifiedRows(fixture);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.ratioUncertainty).toBeGreaterThan(0);
    expect(rows[1]!.caveat).toContain('post-onset');
  });

  it('estimates the ratio-crossing interval from adjacent rows', () => {
    const crossing = estimateFlagshipCrossing(flagshipCertifiedRows(fixture));
    expect(crossing?.gamma).toBeGreaterThan(0.6);
    expect(crossing?.gamma).toBeLessThan(0.7);
    expect(crossing?.between).toEqual([0.6, 0.7]);
  });

  it('produces a deterministic certification and Figure 1 SVG hash', () => {
    const certification = certifyFlagshipGapMap(fixture, 'fixture.json', '2026-01-01T00:00:00.000Z');
    const svg = buildFlagshipFigureSvg(certification);
    expect(certification.status).toBe('certified-with-caveats');
    expect(certification.figureHash).toMatch(/^[0-9a-f]+$/);
    expect(svg).toContain('Flagship Figure 1');
    expect(refinedFlagshipGrid(certification.rows, 0.05).length).toBeGreaterThan(1);
  });
});
