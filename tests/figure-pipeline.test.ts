import { describe, expect, it } from 'vitest';
import {
  FIGURE_THEMES,
  figureFingerprint,
  figureSourceCsv,
  renderStudyFigureSvg,
  studyFigureFromSavedStudy,
  svgToDataUrl,
  type StudyFigureSpec
} from '../src/research/figurePipeline';

const spec: StudyFigureSpec = {
  title: 'Maximal Lyapunov exponent vs theta1',
  xLabel: 'theta1',
  yLabel: 'lambda_max ± SE',
  caption: 'Fixture figure for visual regression.',
  points: [
    { x: 1.5, y: -0.2, err: 0.05 },
    { x: 2.0, y: 0.6, err: 0.04 },
    { x: 2.5, y: 1.4, err: 0.08 }
  ],
  theme: 'light',
  zeroLine: true
};

describe('publication figure pipeline', () => {
  it('renders a well-formed SVG with axes, error bars, markers, and zero line', () => {
    const svg = renderStudyFigureSvg(spec);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Maximal Lyapunov exponent vs theta1');
    expect((svg.match(/<circle/g) ?? []).length).toBe(3); // one marker per point
    expect(svg).toContain('stroke-dasharray="6 4"'); // zero line
    expect(svg).toContain('lambda_max');
    // Error bars: 3 segments per point with err > 0.
    expect((svg.match(/stroke-width="1\.4"/g) ?? []).length).toBe(9);
  });

  it('is deterministic — the visual-regression fingerprint is stable', () => {
    const a = renderStudyFigureSvg(spec);
    const b = renderStudyFigureSvg(JSON.parse(JSON.stringify(spec)) as StudyFigureSpec);
    expect(a).toBe(b);
    expect(figureFingerprint(a)).toBe(figureFingerprint(b));
    // Any visual change must move the fingerprint.
    const moved = renderStudyFigureSvg({
      ...spec,
      points: [...spec.points.slice(0, 2), { x: 2.5, y: 1.5, err: 0.08 }]
    });
    expect(figureFingerprint(moved)).not.toBe(figureFingerprint(a));
  });

  it('applies all four themes with distinct palettes', () => {
    const rendered = (['light', 'dark', 'print', 'colorblind'] as const).map((theme) =>
      renderStudyFigureSvg({ ...spec, theme })
    );
    expect(new Set(rendered.map(figureFingerprint)).size).toBe(4);
    expect(rendered[1]).toContain(FIGURE_THEMES.dark.background);
    expect(rendered[3]).toContain(FIGURE_THEMES.colorblind.accent); // Okabe–Ito blue
  });

  it('escapes hostile labels', () => {
    const svg = renderStudyFigureSvg({ ...spec, title: 'x < y & "z"', caption: '<script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('x &lt; y &amp; &quot;z&quot;');
  });

  it('emits per-figure source CSV with provenance headers', () => {
    const csv = figureSourceCsv(spec, { planHash: 'abc123' });
    expect(csv).toContain('# figure=Maximal Lyapunov exponent vs theta1');
    expect(csv).toContain('# planHash=abc123');
    expect(csv).toContain('x,y,err');
    expect(csv.split('\n').filter((line) => !line.startsWith('#'))).toHaveLength(4); // header + 3 rows
  });

  it('regenerates the figure spec from saved study rows without physics', () => {
    const regenerated = studyFigureFromSavedStudy(
      {
        variable: 'damping',
        strategy: 'sobol',
        planHash: 'plan-1',
        rows: [
          { value: 0, lambdaMax: 1.2, lambdaErr: 0.1 },
          { value: 0.2, lambdaMax: 0.1, lambdaErr: 0.05 }
        ]
      },
      'print'
    );
    expect(regenerated.points).toHaveLength(2);
    expect(regenerated.theme).toBe('print');
    expect(regenerated.zeroLine).toBe(true);
    expect(regenerated.caption).toContain('plan-1');
    expect(validSvg(renderStudyFigureSvg(regenerated))).toBe(true);
  });

  it('handles degenerate inputs (no points, NaN) without throwing', () => {
    expect(validSvg(renderStudyFigureSvg({ ...spec, points: [] }))).toBe(true);
    expect(validSvg(renderStudyFigureSvg({ ...spec, points: [{ x: Number.NaN, y: 1, err: 0 }] }))).toBe(true);
    expect(svgToDataUrl('<svg/>')).toContain('data:image/svg+xml');
  });
});

function validSvg(svg: string): boolean {
  return svg.startsWith('<svg') && svg.endsWith('</svg>') && !svg.includes('NaN');
}
