import type { SpatialConfig, SpatialSample } from '../../adapters/physics/spatial';
import { createPlot } from './core-plots';

export type SpatialPlotKind = 'momentum' | 'residual' | 'energy' | 'trajectory';
export type SpatialProjection = 'xy' | 'xz' | 'yz';
export type SpatialResidual = 'length' | 'unit' | 'tangent';

export function spatialTrajectoryPlot(
  document: Document,
  samples: readonly SpatialSample[],
  kind: SpatialPlotKind,
  selectedLink = 0,
  projection: SpatialProjection = 'xz',
  residual: SpatialResidual = 'length'
) {
  const index = Math.max(0, Math.min((samples[0]?.positions.length ?? 1) - 1, selectedLink));
  if (kind === 'energy')
    return createPlot(document, '에너지', 't (s)', 'E (J)', [
      { label: '총에너지', color: '#075985', points: samples.map((s) => [s.time, s.energy.total]) },
      { label: '운동', color: '#9a3412', points: samples.map((s) => [s.time, s.energy.KE]) },
      { label: '위치', color: '#166534', points: samples.map((s) => [s.time, s.energy.PE]) }
    ]);
  if (kind === 'momentum')
    return createPlot(document, '각운동량', 't (s)', 'L (kg·m²/s)', [
      { label: 'Ly (수직)', color: '#075985', points: samples.map((s) => [s.time, s.angularMomentum.y]) },
      { label: 'Lx', color: '#9a3412', points: samples.map((s) => [s.time, s.angularMomentum.x]) },
      { label: 'Lz', color: '#166534', points: samples.map((s) => [s.time, s.angularMomentum.z]) }
    ]);
  if (kind === 'trajectory') {
    const a = projection[0] as 'x' | 'y',
      b = projection[1] as 'y' | 'z';
    return createPlot(document, `질점 ${index + 1} · ${projection} 평면 투영`, `${a} (m)`, `${b} (m)`, [
      {
        label: `질점 ${index + 1}`,
        color: '#075985',
        points: samples.map((s) => [s.positions[index]![a], s.positions[index]![b]])
      }
    ]);
  }
  const names = { length: ['길이 잔차', 'm'], unit: ['단위벡터 잔차', '1'], tangent: ['접선 잔차', 's⁻¹'] } as const;
  const values = (s: SpatialSample) =>
    residual === 'length'
      ? s.constraintErrors
      : residual === 'unit'
        ? s.unitConstraintErrors
        : s.tangentConstraintErrors;
  return createPlot(document, `링크 ${index + 1} · ${names[residual][0]}`, 't (s)', `잔차 (${names[residual][1]})`, [
    { label: names[residual][0], color: '#075985', points: samples.map((s) => [s.time, values(s)[index]!]) }
  ]);
}

export function exportSpatialFigure(
  document: Document,
  config: SpatialConfig,
  samples: readonly SpatialSample[],
  kind: SpatialPlotKind = 'momentum',
  selectedLink = 0,
  projection: SpatialProjection = 'xz',
  residual: SpatialResidual = 'length'
) {
  const svg = spatialTrajectoryPlot(document, samples, kind, selectedLink, projection, residual);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-spatial-figure/v1',
    configuration: config,
    samples: samples.length,
    kind,
    selectedLink,
    projection,
    residual,
    rendering:
      'Recorded samples reduced to at most about 600 points per series; trajectory is an orthographic plane projection.'
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
