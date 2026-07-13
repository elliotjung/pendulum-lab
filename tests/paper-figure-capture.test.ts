import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '../src/types/domain';
import {
  buildPaperFigureManifest,
  renderCapturedFigureSvg,
  type PaperFigure
} from '../src/app/parity/paper-figure-capture';

const figure: PaperFigure = {
  id: 'phase',
  caption: 'Phase <portrait> & provenance',
  width: 640,
  height: 360,
  dataHash: 'abc123',
  byteEstimate: 4,
  dataUrl: 'data:image/png;base64,AAAA'
};

describe('paper figure capture artifacts', () => {
  it('renders a valid, provenance-labelled SVG without treating pixels as vectors', () => {
    const svg = renderCapturedFigureSvg(figure);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('data-rendering="raster-embedded"');
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).toContain('Phase &lt;portrait&gt; &amp; provenance');
    expect(svg).toContain('canvas #phase');
    expect(svg).toContain('abc123');
    expect(svg).not.toContain('Phase <portrait>');
  });

  it('adds matching PNG and SVG paths to the deterministic manifest', () => {
    const runtime = { hash: 'state-1' } as RuntimeSnapshot;
    const manifest = buildPaperFigureManifest([figure], runtime, '2026-07-13T00:00:00.000Z');
    expect(manifest.figureCount).toBe(1);
    expect(manifest.totalBytes).toBe(4);
    expect(manifest.generatedAt).toBe('2026-07-13T00:00:00.000Z');
    expect(manifest.figures[0]).toMatchObject({
      file: 'figures/figure-01-phase.png',
      svgFile: 'figures/figure-01-phase.svg',
      sourceCanvas: '#phase',
      svgRendering: 'raster-embedded'
    });
  });
});
