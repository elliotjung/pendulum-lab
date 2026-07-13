/**
 * DOM wiring for publication/export panels in the research workbench.
 */
import {
  FIGURE_CAPTIONS,
  exportPaperFigureManifestJson,
  exportPaperFiguresHtml,
  exportPaperMethodsLatex,
  exportPaperMethodsMarkdown,
  exportPaperPackJson,
  exportCapturedFiguresSvgZip,
  exportProvenanceJson,
  exportResearchBundleJson,
  exportResearchBundleZip,
  exportResearchNotebook,
  exportScaledCanvases,
  exportStudyFigureCsv,
  exportStudyFigurePng,
  exportStudyFigureSvg,
  renderFigureStudio,
  renderProvenanceViewer,
  saveSelectedFigureCaption
} from './figure-export';
import { exportManifest } from './governance-ui';
import { append, button, html } from './shared';
import {
  researchActions,
  researchCard,
  researchFormRow,
  researchSelect,
  researchTextArea
} from './research-ui-components';

export interface ResearchExportPanels {
  paperCard: HTMLElement;
  figureCard: HTMLElement;
}

export function buildResearchExportPanels(): ResearchExportPanels {
  const paperCard = researchCard('Paper Export Pack', 'researchPaperCard');
  paperCard.classList.add('research-wide');
  append(
    paperCard,
    researchActions(
      button('rwExportPaperJson', 'Export Pack JSON', () => exportPaperPackJson(), 'primary'),
      button('rwExportFigures', 'Export Figures', () => exportPaperFiguresHtml()),
      button('rwExportFigureManifest', 'Figure Manifest', () => exportPaperFigureManifestJson()),
      button('rwExportPaperMd', 'Export Methods MD', () => exportPaperMethodsMarkdown()),
      button('rwExportPaperTex', 'Export LaTeX', () => exportPaperMethodsLatex()),
      button('rwExportNotebook', 'Export Notebook', () => exportResearchNotebook()),
      button('rwExportBundle', 'Export Bundle', () => exportResearchBundleJson()),
      button('rwExportBundleZip', 'Export ZIP Bundle', () => exportResearchBundleZip(), 'primary'),
      button('rwExportProvenance', 'Provenance JSON', () => exportProvenanceJson()),
      button('rwViewProvenance', 'View Graph', () => renderProvenanceViewer()),
      button('rwExportManifestPack', 'Export Manifest', () => exportManifest('pendulum_research_manifest_v10_ts.json'))
    ),
    html('div', { id: 'rwPaperSummary', className: 'research-summary', text: 'Paper pack not generated yet.' }),
    html('div', { id: 'rwProvenanceView', className: 'research-table-wrap' })
  );

  const figureCard = researchCard('Figure Studio (Publication Pipeline)', 'researchFigureCard');
  const figureSelect = researchSelect(
    'rwFigSelect',
    Object.entries(FIGURE_CAPTIONS).map(([id, caption]) => [id, `${id} - ${caption.slice(0, 44)}`])
  );
  figureSelect.addEventListener('change', () => renderFigureStudio());
  const figureCaption = researchTextArea(
    'rwFigCaption',
    'Custom caption for the selected figure (blank restores the default)'
  );
  append(
    figureCard,
    researchFormRow(
      'Theme',
      researchSelect('rwFigTheme', [
        ['light', 'light'],
        ['dark', 'dark'],
        ['print', 'print (B/W)'],
        ['colorblind', 'colourblind-safe (Okabe-Ito)']
      ])
    ),
    researchFormRow(
      'Scale',
      researchSelect('rwFigScale', [
        ['1', '1x'],
        ['2', '2x'],
        ['4', '4x (print DPI)']
      ])
    ),
    researchFormRow('Figure', figureSelect),
    figureCaption,
    researchActions(
      button('rwFigSaveCaption', 'Save Caption', () => saveSelectedFigureCaption(), 'primary'),
      button('rwFigExportSvg', 'Study Figure SVG', () => exportStudyFigureSvg()),
      button('rwFigExportPng', 'Study Figure PNG', () => {
        void exportStudyFigurePng();
      }),
      button('rwFigExportCsv', 'Figure Source CSV', () => exportStudyFigureCsv()),
      button('rwFigExportCanvases', 'Canvases PNG @ scale', () => exportScaledCanvases()),
      button('rwFigExportCanvasSvg', 'Canvas SVG Pack', () => exportCapturedFiguresSvgZip())
    ),
    html('div', {
      id: 'rwFigureSummary',
      className: 'research-summary',
      text: 'Study SVG regenerates true vectors from saved data. Canvas SVG packs preserve live pixels, captions, dimensions, and hashes in explicitly raster-embedded SVG containers.'
    })
  );

  return { paperCard, figureCard };
}
