import { element } from '../../app/dom';
import type { ConstraintConfig, ConstraintSample } from '../../adapters/physics/constraint';
import { createPlot } from './core-plots';

const NS = 'http://www.w3.org/2000/svg';
const node = (document: Document, name: string, attrs: Record<string, string>) => {
  const e = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
  return e;
};
export type ConstraintPlotKind = 'length' | 'tension' | 'energy' | 'trajectory';
export const constraintPhaseLabel = (phase: ConstraintSample['phase']) =>
  ({
    elastic: '탄성 운동',
    taut: '팽팽함 · taut',
    slack: '느슨함 · slack',
    'outer-slack': '바깥 줄 느슨함 · outer-slack',
    'full-slack': '두 줄 느슨함 · full-slack'
  })[phase];

export function createConstraintScene(document: Document) {
  const wrapper = element(document, 'div', 'core-scene constraint-scene');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-2.3 -2.3 4.6 4.6');
  svg.setAttribute('role', 'img');
  const links = node(document, 'g', {});
  const bobs = node(document, 'g', {});
  svg.append(node(document, 'circle', { cx: '0', cy: '0', r: '0.05', fill: 'currentColor' }), links, bobs);
  const description = element(document, 'p', 'lab-muted');
  wrapper.append(svg, description);
  return {
    element: wrapper,
    update(sample: ConstraintSample, config: ConstraintConfig) {
      const spring = config.systemId === 'system:spring';
      const nominal = spring
        ? Math.max(config.parameters.restLength!, config.initialState[0]!)
        : config.systemId === 'system:rope'
          ? config.parameters.length!
          : config.parameters.l1! + config.parameters.l2!;
      const scale = 1.9 / Math.max(nominal, ...sample.positions.map((point) => Math.hypot(point.x, point.y)), 0.001);
      if (links.children.length !== sample.positions.length) {
        links.replaceChildren(
          ...sample.positions.map(() =>
            node(document, 'path', { fill: 'none', stroke: 'currentColor', 'stroke-width': '0.028' })
          )
        );
        bobs.replaceChildren(
          ...sample.positions.map(() => node(document, 'circle', { r: '0.075', fill: 'currentColor' }))
        );
      }
      let x0 = 0,
        y0 = 0;
      sample.positions.forEach((point, index) => {
        const x = point.x * scale,
          y = -point.y * scale;
        const slack =
          sample.phase === 'slack' || sample.phase === 'full-slack' || (sample.phase === 'outer-slack' && index === 1);
        let path = `M${x0} ${y0} L${x} ${y}`;
        if (spring) {
          const dx = x - x0,
            dy = y - y0,
            length = Math.hypot(dx, dy) || 1;
          const zigzag = Array.from({ length: 13 }, (_, i) => {
            const fraction = (i + 1) / 14;
            const bend = i % 2 ? -0.06 : 0.06;
            return `L${x0 + fraction * dx - (bend * dy) / length} ${y0 + fraction * dy + (bend * dx) / length}`;
          });
          path = `M${x0} ${y0} ${zigzag.join(' ')} L${x} ${y}`;
        } else if (slack) path = `M${x0} ${y0} Q${(x0 + x) / 2 + 0.15} ${(y0 + y) / 2 + 0.2} ${x} ${y}`;
        links.children[index]!.setAttribute('d', path);
        links.children[index]!.setAttribute('stroke-dasharray', slack ? '0.07 0.045' : 'none');
        links.children[index]!.setAttribute('data-link-phase', slack ? 'slack' : spring ? 'elastic' : 'taut');
        bobs.children[index]!.setAttribute('cx', String(x));
        bobs.children[index]!.setAttribute('cy', String(y));
        x0 = x;
        y0 = y;
      });
      svg.setAttribute(
        'aria-label',
        `${spring ? '용수철' : '줄'} 진자: ${constraintPhaseLabel(sample.phase)}. 길이 ${sample.lengths.map((length) => `${length.toPrecision(4)} m`).join(', ')}.`
      );
      description.textContent = spring
        ? '지그재그 선은 용수철을 나타냅니다. 형상은 현재 크기에 맞춰 표시하며 아래 방향이 각도 0입니다.'
        : '실선은 팽팽한 줄, 굽은 파선은 느슨한 줄입니다. 느슨한 선의 굽힘은 상태를 나타내는 기호이며 실제 줄 형상의 해가 아닙니다.';
    }
  };
}

export function constraintTrajectoryPlot(
  document: Document,
  samples: readonly ConstraintSample[],
  kind: ConstraintPlotKind,
  selectedLink = 0
) {
  const index = Math.max(0, Math.min((samples[0]?.positions.length ?? 1) - 1, selectedLink));
  const spring = samples[0]?.phase === 'elastic';
  if (kind === 'energy')
    return createPlot(document, '에너지', 't (s)', 'E (J)', [
      { label: '총에너지', color: '#075985', points: samples.map((sample) => [sample.time, sample.energy.total]) },
      { label: '누적 포획 손실', color: '#9a3412', points: samples.map((sample) => [sample.time, sample.captureLoss]) }
    ]);
  if (kind === 'trajectory')
    return createPlot(document, `질점 ${index + 1} 궤적`, 'x (m)', 'y (m)', [
      {
        label: `질점 ${index + 1}`,
        color: '#075985',
        points: samples.map((sample) => [sample.positions[index]!.x, sample.positions[index]!.y])
      }
    ]);
  return createPlot(
    document,
    kind === 'length' ? `링크 ${index + 1} 길이` : spring ? '용수철 힘' : `줄 ${index + 1} 장력`,
    't (s)',
    kind === 'length' ? 'r (m)' : 'F (N)',
    [
      {
        label: kind === 'length' ? '현재 길이' : spring ? '탄성력 (인장 +)' : '장력',
        color: '#075985',
        points: samples.map((sample) => [
          sample.time,
          kind === 'length' ? sample.lengths[index]! : sample.tensions[index]!
        ])
      }
    ]
  );
}

export function exportConstraintFigure(
  document: Document,
  config: ConstraintConfig,
  samples: readonly ConstraintSample[],
  kind: ConstraintPlotKind = 'length',
  selectedLink = 0
) {
  const svg = constraintTrajectoryPlot(document, samples, kind, selectedLink);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', NS);
  const metadata = node(document, 'metadata', {});
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-constraint-figure/v1',
    configuration: config,
    samples: samples.length,
    kind,
    selectedLink,
    rendering:
      'Recorded samples reduced to at most about 600 points. Events are exported separately; lines do not resolve capture discontinuities.'
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
