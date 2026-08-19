/**
 * Public compatibility barrel for the publication-export layer.
 *
 * Exporters are intentionally organized by artifact: vector/raster figures,
 * paper methods, notebooks, provenance, and binary ZIP bundles.
 */
export {
  FIGURE_CAPTIONS,
  FIGURE_CAPTION_OVERRIDE_KEY,
  blankCanvasCache,
  blankDataUrl,
  collectPaperFigures,
  effectiveFigureCaption,
  loadFigureCaptionOverrides,
  renderCapturedFigureSvg,
  saveFigureCaptionOverride
} from './paper-figure-capture';
export type { PaperFigure, PaperFigureManifest } from './paper-figure-capture';

export * from './figure-export-methods';
export * from './figure-export-figures';
export * from './figure-export-paper';
export * from './figure-export-notebook';
export * from './figure-export-provenance';
export * from './figure-export-zip';
