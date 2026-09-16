import { element } from '../../app/dom';
import type { ChainConfig, ChainSample } from '../../adapters/physics/chain';
import { createPlot } from './core-plots';

const NS = 'http://www.w3.org/2000/svg';
const node = (document: Document, name: string, attrs: Record<string, string>) => {
  const e = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
  return e;
};
export function createChainScene(document: Document) {
  const wrapper = element(document, 'div', 'core-scene chain-scene');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-2.3 -2.3 4.6 4.6');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '다중 진자 애니메이션');
  const rods = node(document, 'path', { fill: 'none', stroke: 'currentColor', 'stroke-width': '0.025' });
  const bobs = node(document, 'g', {});
  svg.append(node(document, 'circle', { cx: '0', cy: '0', r: '0.045', fill: 'currentColor' }), rods, bobs);
  const description = element(document, 'p', 'lab-muted');
  wrapper.append(svg, description);
  return {
    element: wrapper,
    update(sample: ChainSample, config: ChainConfig) {
      const n = config.parameters.masses.length,
        scale = 2 / config.parameters.lengths.reduce((a, b) => a + b, 0);
      rods.setAttribute('d', `M0 0 ${sample.positions.map((p) => `L${p.x * scale} ${-p.y * scale}`).join(' ')}`);
      if (bobs.children.length !== n)
        bobs.replaceChildren(
          ...Array.from({ length: n }, () =>
            node(document, 'circle', { r: String(Math.max(0.012, 0.075 / Math.sqrt(n / 3))), fill: 'currentColor' })
          )
        );
      sample.positions.forEach((p, i) => {
        bobs.children[i]!.setAttribute('cx', String(p.x * scale));
        bobs.children[i]!.setAttribute('cy', String(-p.y * scale));
      });
      description.textContent = `${n}개 링크 · 아래 방향이 각도 0입니다. 형상은 전체 길이에 맞춰 축소하며 실제 길이와 각도는 수치 상태에서 읽을 수 있습니다.`;
    }
  };
}
export function chainTrajectoryPlot(
  document: Document,
  samples: readonly ChainSample[],
  kind: 'state-time' | 'energy' | 'phase',
  selectedLink = 0
) {
  const n = (samples[0]?.state.length ?? 2) / 2;
  const index = Math.max(0, Math.min(n - 1, selectedLink));
  if (kind === 'energy')
    return createPlot(document, '에너지', 't (s)', 'E (J)', [
      { label: '전체 에너지', color: '#075985', points: samples.map((s) => [s.time, s.energy.total]) },
      { label: '운동 에너지', color: '#9a3412', points: samples.map((s) => [s.time, s.energy.KE]) }
    ]);
  return kind === 'phase'
    ? createPlot(document, `링크 ${index + 1} 위상공간`, 'θ (rad)', 'ω (rad/s)', [
        {
          label: `링크 ${index + 1}`,
          color: '#075985',
          points: samples.map((s) => [s.state[index]!, s.state[n + index]!])
        }
      ])
    : createPlot(document, `링크 ${index + 1} 상태 / 시간`, 't (s)', 'θ (rad)', [
        { label: `θ${index + 1}`, color: '#075985', points: samples.map((s) => [s.time, s.state[index]!]) }
      ]);
}
export function exportChainFigure(
  document: Document,
  config: ChainConfig,
  samples: readonly ChainSample[],
  selectedLink = 0
): string {
  const svg = chainTrajectoryPlot(document, samples, 'state-time', selectedLink);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', NS);
  const metadata = node(document, 'metadata', {});
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-chain-figure/v1',
    configuration: config,
    samples: samples.length,
    selectedLink,
    rendering: 'Recorded samples only; figure reduced to at most about 600 points.'
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
