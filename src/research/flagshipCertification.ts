import { hashText } from './researchExportUtils';

export const FLAGSHIP_FIGURE_1_CAPTION =
  'Figure 1. Quantitative gap map between the analytic Melnikov homoclinic-tangle threshold A_c(gamma) and the measured period-doubling onset A_PD(gamma) of the primary period-1 attractor at omega=2/3. Error bars report the onset-localization contract, the dashed line marks A_PD/A_c=1, and the vertical marker is the interpolated reversal where the cascade begins below the first-order Melnikov prediction.';

export const FLAGSHIP_REVIEWER_APPENDIX_NOTE =
  'The flagship claim is not that Melnikov theory predicts the attractor cascade. It is a measured separation map: A_c is analytic first-order geometry, A_PD is a Floquet-refined attractor-branch instability, and the reported reversal is bounded by the exported caveat map and the independent Python A_PD probes.';

export interface FlagshipPaperStudyMeasurement {
  gamma: number;
  Ac: number;
  attractorBracket?: [number, number] | null;
  Apd?: number | null;
  lossType?: string;
  rhoBelow?: number | null;
  rhoAbove?: number | null;
  ratio?: number | null;
  K_below?: number | null;
  K_above?: number | null;
}

export interface FlagshipPaperStudyReport {
  schemaVersion?: string;
  generatedAt?: string;
  driveFrequency: number;
  dt: number;
  measurements: FlagshipPaperStudyMeasurement[];
  dtSensitivity?: {
    gamma: number;
    dtFine: number;
    ApdFine: number | null;
    ApdCoarse: number | null;
    absDelta: number | null;
  };
}

export interface FlagshipCertifiedRow {
  gamma: number;
  Ac: number;
  Apd: number;
  ratio: number;
  onsetUncertainty: number;
  ratioUncertainty: number;
  rhoBelow: number | null;
  rhoAbove: number | null;
  kBelow: number | null;
  kAbove: number | null;
  caveat: string;
}

export interface FlagshipCrossingEstimate {
  gamma: number;
  lower: number;
  upper: number;
  between: [number, number];
  ratioBefore: number;
  ratioAfter: number;
}

export interface FlagshipCertification {
  schemaVersion: 'pendulum-flagship-certification/v1';
  generatedAt: string;
  sourceStudy: string;
  driveFrequency: number;
  dt: number;
  crossing: FlagshipCrossingEstimate | null;
  rows: FlagshipCertifiedRow[];
  refinedGrid: Array<{ gamma: number; ratio: number; ratioUncertainty: number }>;
  figureCaption: string;
  reviewerAppendixNote: string;
  figureHash: string;
  status: 'certified' | 'certified-with-caveats' | 'insufficient';
  caveats: string[];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function flagshipCertifiedRows(report: FlagshipPaperStudyReport): FlagshipCertifiedRow[] {
  const dtGamma = report.dtSensitivity?.gamma;
  const dtRatioUncertainty = finiteNumber(report.dtSensitivity?.absDelta)
    ? Math.abs(report.dtSensitivity!.absDelta!) / Math.max(1e-12, report.measurements.find((row) => row.gamma === dtGamma)?.Ac ?? 1)
    : 0;
  return report.measurements
    .filter((row) => finiteNumber(row.gamma) && finiteNumber(row.Ac) && finiteNumber(row.Apd) && finiteNumber(row.ratio))
    .map((row) => {
      const bracket = row.attractorBracket;
      const onsetUncertainty = bracket ? Math.abs(bracket[1] - bracket[0]) / 2 : Math.max(1e-8, row.Ac * 1e-6);
      const bracketRatioUncertainty = onsetUncertainty / Math.max(1e-12, row.Ac);
      const localDtUncertainty = row.gamma === dtGamma ? dtRatioUncertainty : 0;
      const ratioUncertainty = Math.max(bracketRatioUncertainty, localDtUncertainty, 1e-8);
      const kAbove = finiteNumber(row.K_above) ? row.K_above : null;
      const kBelow = finiteNumber(row.K_below) ? row.K_below : null;
      const caveats: string[] = [];
      if (row.lossType !== 'period-doubling') caveats.push(`lossType=${row.lossType ?? 'unknown'}`);
      if (kBelow !== null && kBelow > 0.2) caveats.push('below-onset 0-1 sample is not cleanly regular');
      if (kAbove !== null && kAbove < 0.7) caveats.push('post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD');
      return {
        gamma: row.gamma,
        Ac: row.Ac,
        Apd: row.Apd!,
        ratio: row.ratio!,
        onsetUncertainty,
        ratioUncertainty,
        rhoBelow: finiteNumber(row.rhoBelow) ? row.rhoBelow : null,
        rhoAbove: finiteNumber(row.rhoAbove) ? row.rhoAbove : null,
        kBelow,
        kAbove,
        caveat: caveats.length ? caveats.join('; ') : 'none'
      };
    })
    .sort((a, b) => a.gamma - b.gamma);
}

export function estimateFlagshipCrossing(rows: FlagshipCertifiedRow[]): FlagshipCrossingEstimate | null {
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if ((a.ratio - 1) * (b.ratio - 1) <= 0 && a.ratio !== b.ratio) {
      const t = (1 - a.ratio) / (b.ratio - a.ratio);
      const gamma = a.gamma + t * (b.gamma - a.gamma);
      const slope = Math.abs((b.ratio - a.ratio) / (b.gamma - a.gamma));
      const gammaUncertainty = slope > 0 ? Math.max(a.ratioUncertainty, b.ratioUncertainty) / slope : (b.gamma - a.gamma) / 2;
      return {
        gamma,
        lower: Math.max(a.gamma, gamma - gammaUncertainty),
        upper: Math.min(b.gamma, gamma + gammaUncertainty),
        between: [a.gamma, b.gamma],
        ratioBefore: a.ratio,
        ratioAfter: b.ratio
      };
    }
  }
  return null;
}

function interpolate(rows: FlagshipCertifiedRow[], gamma: number): { ratio: number; ratioUncertainty: number } {
  if (gamma <= rows[0]!.gamma) return { ratio: rows[0]!.ratio, ratioUncertainty: rows[0]!.ratioUncertainty };
  if (gamma >= rows[rows.length - 1]!.gamma) {
    const last = rows[rows.length - 1]!;
    return { ratio: last.ratio, ratioUncertainty: last.ratioUncertainty };
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (gamma >= a.gamma && gamma <= b.gamma) {
      const t = (gamma - a.gamma) / (b.gamma - a.gamma);
      return {
        ratio: a.ratio + t * (b.ratio - a.ratio),
        ratioUncertainty: a.ratioUncertainty + t * (b.ratioUncertainty - a.ratioUncertainty)
      };
    }
  }
  return { ratio: rows[0]!.ratio, ratioUncertainty: rows[0]!.ratioUncertainty };
}

export function refinedFlagshipGrid(rows: FlagshipCertifiedRow[], step = 0.01): Array<{ gamma: number; ratio: number; ratioUncertainty: number }> {
  if (rows.length === 0) return [];
  const start = rows[0]!.gamma;
  const end = rows[rows.length - 1]!.gamma;
  const out: Array<{ gamma: number; ratio: number; ratioUncertainty: number }> = [];
  for (let gamma = start; gamma <= end + 1e-12; gamma += step) {
    const value = interpolate(rows, gamma);
    out.push({ gamma: Number(gamma.toFixed(4)), ratio: value.ratio, ratioUncertainty: value.ratioUncertainty });
  }
  return out;
}

export function buildFlagshipFigureSvg(certification: Pick<FlagshipCertification, 'rows' | 'crossing'>): string {
  const rows = certification.rows;
  const width = 760;
  const height = 430;
  const margin = { left: 62, right: 28, top: 34, bottom: 54 };
  const minGamma = Math.min(...rows.map((row) => row.gamma));
  const maxGamma = Math.max(...rows.map((row) => row.gamma));
  const minRatio = Math.min(0.94, ...rows.map((row) => row.ratio - 3 * row.ratioUncertainty));
  const maxRatio = Math.max(1.25, ...rows.map((row) => row.ratio + 3 * row.ratioUncertainty));
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (gamma: number): number => margin.left + ((gamma - minGamma) / (maxGamma - minGamma)) * plotW;
  const y = (ratio: number): number => margin.top + (1 - (ratio - minRatio) / (maxRatio - minRatio)) * plotH;
  const polyline = rows.map((row) => `${x(row.gamma).toFixed(2)},${y(row.ratio).toFixed(2)}`).join(' ');
  const errorBars = rows.map((row) => {
    const x0 = x(row.gamma);
    const y1 = y(row.ratio - row.ratioUncertainty);
    const y2 = y(row.ratio + row.ratioUncertainty);
    return `<line x1="${x0.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x0.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#345" stroke-width="1"/><line x1="${(x0 - 4).toFixed(2)}" y1="${y1.toFixed(2)}" x2="${(x0 + 4).toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#345" stroke-width="1"/><line x1="${(x0 - 4).toFixed(2)}" y1="${y2.toFixed(2)}" x2="${(x0 + 4).toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#345" stroke-width="1"/>`;
  }).join('');
  const points = rows.map((row) => `<circle cx="${x(row.gamma).toFixed(2)}" cy="${y(row.ratio).toFixed(2)}" r="4.2" fill="#0f766e" stroke="#063" stroke-width="1"/>`).join('');
  const crossing = certification.crossing
    ? `<line x1="${x(certification.crossing.gamma).toFixed(2)}" y1="${margin.top}" x2="${x(certification.crossing.gamma).toFixed(2)}" y2="${height - margin.bottom}" stroke="#b45309" stroke-width="2" stroke-dasharray="6 5"/><text x="${(x(certification.crossing.gamma) + 8).toFixed(2)}" y="${margin.top + 18}" font-size="13" fill="#7c2d12">gamma ~= ${certification.crossing.gamma.toFixed(3)}</text>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Flagship Figure 1 Melnikov gap map">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    `<text x="${margin.left}" y="24" font-size="18" font-family="Arial, sans-serif" fill="#0f172a">Figure 1. Melnikov threshold vs period-doubling onset gap map</text>`,
    `<line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#0f172a" stroke-width="1.3"/>`,
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#0f172a" stroke-width="1.3"/>`,
    `<line x1="${margin.left}" y1="${y(1).toFixed(2)}" x2="${width - margin.right}" y2="${y(1).toFixed(2)}" stroke="#64748b" stroke-width="1" stroke-dasharray="4 4"/>`,
    `<text x="${width - margin.right - 56}" y="${(y(1) - 7).toFixed(2)}" font-size="12" fill="#475569">A_PD/A_c = 1</text>`,
    errorBars,
    `<polyline points="${polyline}" fill="none" stroke="#0f766e" stroke-width="3"/>`,
    points,
    crossing,
    `<text x="${width / 2 - 65}" y="${height - 15}" font-size="14" fill="#0f172a">damping gamma</text>`,
    `<text x="16" y="${height / 2 + 76}" transform="rotate(-90 16 ${height / 2 + 76})" font-size="14" fill="#0f172a">ratio A_PD / A_c</text>`,
    '</svg>',
    ''
  ].join('\n');
}

export function certifyFlagshipGapMap(
  report: FlagshipPaperStudyReport,
  sourceStudy: string = 'reports/paper-study.json',
  generatedAt: string = new Date().toISOString()
): FlagshipCertification {
  const rows = flagshipCertifiedRows(report);
  const crossing = rows.length >= 2 ? estimateFlagshipCrossing(rows) : null;
  const refinedGrid = refinedFlagshipGrid(rows);
  const caveats = [
    ...rows.filter((row) => row.caveat !== 'none').map((row) => `gamma=${row.gamma.toFixed(2)}: ${row.caveat}`),
    'Error bars combine attractor-bracket width with the available dt-sensitivity probe; they are a localization contract, not a full Bayesian posterior.',
    'Basin caveats are inferred from the exported 0-1 strobe probes; they flag multistability/transient-chaos risk but do not replace a full basin scan.'
  ];
  const partial = { rows, crossing };
  const figureSvg = buildFlagshipFigureSvg(partial);
  return {
    schemaVersion: 'pendulum-flagship-certification/v1',
    generatedAt,
    sourceStudy,
    driveFrequency: report.driveFrequency,
    dt: report.dt,
    crossing,
    rows,
    refinedGrid,
    figureCaption: FLAGSHIP_FIGURE_1_CAPTION,
    reviewerAppendixNote: FLAGSHIP_REVIEWER_APPENDIX_NOTE,
    figureHash: hashText(figureSvg),
    status: crossing ? (caveats.length > 2 ? 'certified-with-caveats' : 'certified') : 'insufficient',
    caveats
  };
}
