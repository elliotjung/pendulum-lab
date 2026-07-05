/**
 * Educational chart-verification card for the 3D lab: runs the CURRENT
 * spherical N-chain configuration through the polar chart and the embedded
 * chart side by side (src/physics/sphericalChartComparison) and reports the
 * position agreement plus each chart's own E / L_z drift. All numerics are
 * headless and unit-tested; this module only reads controls and renders.
 */
import { compareSphericalCharts } from '../../physics/sphericalChartComparison';
import { button, html, setText } from './shared';
import { researchActions, researchCard } from './research-ui-components';
import { renderResearchTable } from './research-renderers';
import { lab3dChainInitialState, lab3dChainParams } from './lab3d-spherical-chain-ui';

function formatExp(value: number): string {
  return Number.isFinite(value) ? value.toExponential(2) : 'n/a';
}

export function runChartComparison(): void {
  const params = lab3dChainParams();
  const initial = lab3dChainInitialState();
  const result = compareSphericalCharts(params, initial, { dt: 0.001, totalTime: 3, sampleEvery: 0.5 });
  setText(
    'd3ChartCompareSummary',
    `N=${result.n}, T=${result.totalTime}s, dt=${result.dt}: max bob distance ${formatExp(result.maxBobDistance)} m (final ${formatExp(result.finalBobDistance)}). `
    + `Polar chart drift E=${formatExp(result.polar.energyDrift)}, Lz=${formatExp(result.polar.lzDrift)}; `
    + `embedded chart drift E=${formatExp(result.embedded.energyDrift)}, Lz=${formatExp(result.embedded.lzDrift)}, `
    + `|u|-1=${formatExp(result.embedded.unitConstraintError)}. ${result.caveat}`
  );
  renderResearchTable(
    'd3ChartCompareTable',
    ['t (s)', 'max bob distance', 'polar E drift', 'embedded E drift'],
    result.samples.map((sample) => [
      sample.time.toFixed(2),
      formatExp(sample.maxBobDistance),
      formatExp(sample.polarEnergyDrift),
      formatExp(sample.embeddedEnergyDrift)
    ]),
    'Run the comparison to fill per-sample agreement.'
  );
}

export function buildChartComparisonCard(): HTMLElement {
  const card = researchCard('Chart Verification (Polar vs Embedded)', 'lab3dChartCompareCard');
  card.classList.add('research-wide');
  card.append(
    html('p', {
      className: 'research-summary',
      text: 'Integrates the current chain through two independent formulations of the same mechanics - the polar-angle chart (clamped near the poles) and the embedded unit-vector chart (pole-free) - and measures how far the bob positions drift apart. Agreement at integrator precision is the verification; divergence growing with the Lyapunov time is expected for chaotic initial conditions.'
    }),
    researchActions(
      button('d3RunChartCompare', 'Run Chart Comparison', () => runChartComparison(), 'primary')
    ),
    html('div', { id: 'd3ChartCompareSummary', className: 'research-summary', text: 'No comparison run yet.' }),
    html('div', { id: 'd3ChartCompareTable', className: 'research-table-wrap' })
  );
  return card;
}
