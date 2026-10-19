import {
  drivenHasForcing,
  drivenSupportsController,
  type DrivenConfig,
  type DrivenSample
} from '../../adapters/physics/driven';
import { drivenInputUnit, drivenStateFields } from './driven-storage';
import { createPlot } from './core-plots';

export type DrivenPlotKind = 'state' | 'error' | 'input' | 'energy' | 'phase';

export function drivenTrajectoryPlot(
  document: Document,
  config: DrivenConfig,
  samples: readonly DrivenSample[],
  kind: DrivenPlotKind,
  selected = 0
) {
  const fields = drivenStateFields(config.systemId),
    index = Math.max(0, Math.min(fields.length - 1, selected));
  const field = fields[index]!;
  const series = (label: string, value: (s: DrivenSample) => number, color = '#075985') => ({
    label,
    color,
    points: samples.map((s) => [s.time, value(s)] as [number, number])
  });
  if (kind === 'phase')
    return createPlot(
      document,
      config.systemId === 'system:coupled' ? '각도 차이 위상공간' : '각도 위상공간',
      config.systemId === 'system:coupled' ? 'θ₁−θ₂ (rad)' : 'θ (rad)',
      config.systemId === 'system:coupled' ? 'ω₁−ω₂ (rad/s)' : 'ω (rad/s)',
      [
        {
          label: config.systemId === 'system:coupled' ? '진자 1−진자 2' : '첫 진자',
          color: '#075985',
          points: samples.map((s) => [s.phase.x, s.phase.y])
        }
      ]
    );
  if (kind === 'energy')
    return createPlot(document, '진단 에너지', 't (s)', 'E (J)', [series('진단 에너지', (s) => s.energy)]);
  if (kind === 'input') {
    // Parametric forcing and a controller never coexist; all displayed series share one unit.
    return createPlot(document, '구동과 제어 입력', 't (s)', `입력 (${drivenInputUnit(config.systemId)})`, [
      ...(drivenHasForcing(config.systemId) ? [series('구동 입력', (s) => s.forcing)] : []),
      ...(drivenSupportsController(config.systemId) ? [series('제어 입력', (s) => s.control, '#9a3412')] : [])
    ]);
  }
  if (kind === 'error')
    return createPlot(
      document,
      '기준값과 상태 오차',
      't (s)',
      config.systemId === 'system:cartpole' ? 'x (m)' : 'θ (rad)',
      [
        series('기준값', (s) => s.reference),
        series('관측 상태', (s) => s.reference - s.error, '#9a3412'),
        series('기준−상태', (s) => s.error, '#166534')
      ]
    );
  return createPlot(document, `${field[1]} 시간 기록`, 't (s)', `${field[0]} (${field[2]})`, [
    series(field[1], (s) => s.state[index]!)
  ]);
}

export function exportDrivenFigure(
  document: Document,
  config: DrivenConfig,
  samples: readonly DrivenSample[],
  kind: DrivenPlotKind = 'state',
  selected = 0
) {
  const svg = drivenTrajectoryPlot(document, config, samples, kind, selected);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-driven-figure/v1',
    configuration: config,
    samples: samples.length,
    kind,
    selected,
    rendering:
      'Recorded samples reduced to at most about 600 points per series; energy is a diagnostic, not a conservation test.'
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
