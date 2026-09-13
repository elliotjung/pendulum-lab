import { element } from '../app/dom';
import { createPlot, type PlotSeries } from '../lab/views/core-plots';
import type { FocusExperimentDefinition } from '../learn/schema';
import type { FocusFrame, FocusSnapshot } from './runtime';

const colors = ['#075985', '#9a3412', '#6b21a8'];
const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const compactTick = (value: number) =>
  value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) ? value.toExponential(2) : value.toPrecision(4);
const number = (value: number) => (Math.abs(value) < 1e-4 && value !== 0 ? value.toExponential(4) : value.toFixed(5));
function values(document: Document, entries: readonly (readonly [string, string])[]) {
  const list = element(document, 'dl', 'focus-values');
  for (const [label, value] of entries) {
    const row = element(document, 'div', '');
    row.append(element(document, 'dt', '', label), element(document, 'dd', '', value));
    list.append(row);
  }
  return list;
}

/** Keep Focus chart labels readable when the SVG shrinks on narrow screens. */
function focusPlot(
  document: Document,
  title: string,
  xLabel: string,
  yLabel: string,
  series: readonly PlotSeries[],
  scatter = false,
  options: Parameters<typeof createPlot>[6] = {}
) {
  const svg = createPlot(document, title, xLabel, yLabel, series, scatter, {
    ...options,
    formatTick: compactTick
  });
  const figure = element(document, 'figure', 'focus-chart');
  const caption = element(document, 'figcaption', 'focus-chart__caption');
  caption.append(element(document, 'span', 'focus-chart__title', title));
  const legend = element(document, 'ul', 'focus-chart__legend');
  legend.setAttribute('aria-label', `${title} 범례`);
  const lineStyles = ['solid', 'dashed', 'dotted'] as const;
  const lineNames = ['실선', '파선', '점선'] as const;
  const lineDashes = ['none', '6 3', '2 4'] as const;
  const paths = svg.querySelectorAll('path[stroke-width="2"]');
  for (const [index, entry] of series.entries()) {
    const style = scatter ? 'point' : lineStyles[index % lineStyles.length]!;
    const name = scatter ? '점' : lineNames[index % lineNames.length]!;
    // Only Focus figures use a distinct third line pattern; existing Lab figures are unchanged.
    paths[index]?.setAttribute('stroke-dasharray', lineDashes[index % lineDashes.length]!);
    const item = element(document, 'li', 'focus-chart__legend-item');
    const swatch = element(document, 'span', 'focus-chart__swatch');
    swatch.dataset.lineStyle = style;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, element(document, 'span', '', `${entry.label} · ${name}`));
    legend.append(item);
  }
  // Repeat the exact rendered limits, avoiding a second, potentially different axis calculation.
  const tick = (x: number, y: number) => svg.querySelector(`text[x="${x}"][y="${y}"]`)!.textContent;
  const axes = element(document, 'div', 'focus-chart__axes');
  axes.append(
    element(document, 'p', '', `가로축 ${xLabel}: ${tick(70, 317)} ~ ${tick(620, 317)}`),
    element(document, 'p', '', `세로축 ${yLabel}: ${tick(8, 290)} ~ ${tick(8, 68)}`)
  );
  caption.append(legend, axes);
  if (!series.some((entry) => entry.points.some(([x, y]) => Number.isFinite(x) && Number.isFinite(y))))
    caption.append(element(document, 'p', '', '표시할 결과가 없습니다. 조건을 확인하고 실행하세요.'));
  svg.setAttribute(
    'aria-label',
    `${title}. ${axes.textContent}. ${legend.textContent}. 그래프 설명과 범위는 그림 위에 표시합니다.`
  );
  figure.append(caption, svg);
  return figure;
}

export function renderFocusResults(document: Document, definition: FocusExperimentDefinition, snapshot: FocusSnapshot) {
  const root = element(document, 'div', 'focus-results');
  const d = snapshot.diagnostics;
  const timePlot = (
    title: string,
    unit: string,
    entries: readonly (readonly [string, (frame: FocusFrame) => number])[]
  ) => {
    const series: PlotSeries[] = entries.map(([label, value], index) => ({
      label,
      color: colors[index % colors.length]!,
      points: snapshot.series
        .map((frame): readonly [number, number] => [frame.sample.time, value(frame)])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    }));
    return focusPlot(document, title, 't (s)', unit, series);
  };
  for (const plot of definition.plotIds) {
    const block = element(document, 'section', 'focus-result');
    block.dataset.focusPlot = plot;
    if (plot === 'configuration') {
      block.append(
        element(document, 'h3', '', '구성공간의 현재 점'),
        focusPlot(
          document,
          '구성공간',
          'θ₁ (rad)',
          'θ₂ (rad)',
          [
            {
              label: '두 절대각',
              color: colors[0]!,
              points: [[wrapped(snapshot.sample.state[0]), wrapped(snapshot.sample.state[1])]]
            }
          ],
          true,
          { bounds: { xMin: -Math.PI, xMax: Math.PI, yMin: -Math.PI, yMax: Math.PI } }
        ),
        values(document, [
          ['(θ₁, θ₂) (rad)', `${number(snapshot.sample.state[0])}, ${number(snapshot.sample.state[1])}`]
        ]),
        element(
          document,
          'p',
          '',
          '각도에 2π를 더하면 같은 자세입니다. 이 평면 표시는 주기적인 구성공간의 좌표 표현입니다.'
        )
      );
    } else if (plot === 'cartesian') {
      block.append(
        element(document, 'h3', '', '질점의 위치와 속도'),
        focusPlot(document, '두 질점의 궤적', 'x (m)', 'y (m)', [
          {
            label: '질점 1',
            color: colors[0]!,
            points: snapshot.series.map(({ sample: s }) => [s.positions.first.x, s.positions.first.y])
          },
          {
            label: '질점 2',
            color: colors[1]!,
            points: snapshot.series.map(({ sample: s }) => [s.positions.second.x, s.positions.second.y])
          }
        ]),
        values(document, [
          [
            '질점 1 (x, y) m',
            `${number(snapshot.sample.positions.first.x)}, ${number(snapshot.sample.positions.first.y)}`
          ],
          [
            '질점 2 (x, y) m',
            `${number(snapshot.sample.positions.second.x)}, ${number(snapshot.sample.positions.second.y)}`
          ],
          ['질점 1 (vx, vy) m/s', `${number(d.velocities[0].x)}, ${number(d.velocities[0].y)}`],
          ['질점 2 (vx, vy) m/s', `${number(d.velocities[1].x)}, ${number(d.velocities[1].y)}`],
          [
            '첫 막대 길이 잔차 (m)',
            number(
              Math.hypot(snapshot.sample.positions.first.x, snapshot.sample.positions.first.y) -
                snapshot.config.parameters.l1
            )
          ],
          [
            '둘째 막대 길이 잔차 (m)',
            number(
              Math.hypot(
                snapshot.sample.positions.second.x - snapshot.sample.positions.first.x,
                snapshot.sample.positions.second.y - snapshot.sample.positions.first.y
              ) - snapshot.config.parameters.l2
            )
          ]
        ])
      );
    } else if (plot === 'angular') {
      block.append(
        element(document, 'h3', '', '각좌표 궤적'),
        timePlot('각도의 시간 변화', 'θ (rad)', [
          ['θ₁', (f) => f.sample.state[0]],
          ['θ₂', (f) => f.sample.state[1]]
        ])
      );
    } else if (plot === 'mass-matrix') {
      const table = element(document, 'table', 'focus-matrix');
      table.append(element(document, 'caption', '', '현재 질량행렬 M (kg·m²)'));
      const head = element(document, 'tr', '');
      for (const label of ['행 / 열', '1', '2']) {
        const th = element(document, 'th', '', label);
        th.scope = 'col';
        head.append(th);
      }
      const thead = element(document, 'thead', '');
      thead.append(head);
      table.append(thead);
      const tbody = element(document, 'tbody', '');
      d.massMatrix.forEach((row, i) => {
        const tr = element(document, 'tr', '');
        const th = element(document, 'th', '', String(i + 1));
        th.scope = 'row';
        tr.append(th);
        for (const value of row)
          tr.append(element(document, 'td', value < 0 ? 'focus-negative' : 'focus-positive', number(value)));
        tbody.append(tr);
      });
      table.append(tbody);
      block.append(
        element(document, 'h3', '', '자세에 따른 관성 결합'),
        table,
        values(document, [
          ['행렬식 (kg²·m⁴)', number(d.determinant)],
          ['상대 행렬식 (1)', number(d.relativeDeterminant)]
        ])
      );
    } else if (plot === 'energy-terms') {
      const e = d.energyTerms;
      block.append(
        element(document, 'h3', '', '에너지 항 분해'),
        values(document, [
          ['T₁ (J)', number(e.kinetic1)],
          ['T₂ (J)', number(e.kinetic2)],
          ['T교차 (J)', number(e.coupling)],
          ['V₁ (J)', number(e.potential1)],
          ['V₂ (J)', number(e.potential2)],
          ['E − E최저 (J)', number(e.totalAboveMinimum)]
        ]),
        element(
          document,
          'p',
          '',
          '아래로 매달린 평형에서 위치에너지를 0으로 정했습니다. 교차 운동에너지는 부호를 가질 수 있습니다.'
        )
      );
    } else if (plot === 'acceleration' || plot === 'derivation') {
      block.append(
        element(
          document,
          'h3',
          '',
          plot === 'derivation' ? '유도 항과 최종 가속도 연결' : '같은 상태에서 가속도 기여 비교'
        ),
        values(document, [
          ['중력 기여 (rad/s²)', d.acceleration.gravity.map(number).join(', ')],
          ['속도 결합 기여 (rad/s²)', d.acceleration.velocity.map(number).join(', ')],
          ['감쇠 기여 (rad/s²)', d.acceleration.damping.map(number).join(', ')],
          ['전체 (α₁, α₂) (rad/s²)', d.acceleration.total.map(number).join(', ')]
        ])
      );
      if (plot === 'derivation') {
        const balance = d.acceleration.total.map(
          (a, i) => a - d.acceleration.gravity[i]! - d.acceleration.velocity[i]! - d.acceleration.damping[i]!
        );
        block.append(
          values(document, [
            [
              '두 방정식의 좌변−우변 잔차 (J)',
              d.massMatrix.map((row) => number(row[0] * balance[0]! + row[1] * balance[1]!)).join(', ')
            ]
          ]),
          element(
            document,
            'p',
            '',
            '공용 엔진의 전체 가속도와 분리한 힘의 가속도에 동일 질량행렬을 곱해 Mα와 우변을 비교합니다. 0 부근 잔차는 이 상태의 수치적 일관성을 뜻합니다.'
          )
        );
      }
    } else if (plot === 'linear-modes') {
      block.append(
        element(document, 'h3', '', '선형 정상모드와 비선형 운동'),
        timePlot('첫 각도의 선형·비선형 비교', 'θ₁ (rad)', [
          ['비선형', (f) => f.sample.state[0]],
          ['선형', (f) => f.linearState?.[0] ?? 0]
        ]),
        values(document, [
          [
            '표시 표본 전체에서 최대 각도 오차 (rad)',
            number(
              Math.max(
                ...snapshot.series.map((frame) =>
                  Math.hypot(
                    frame.sample.state[0] - (frame.linearState?.[0] ?? 0),
                    frame.sample.state[1] - (frame.linearState?.[1] ?? 0)
                  )
                )
              )
            )
          ],
          [
            '현재 각도 오차 (rad)',
            number(
              Math.hypot(
                snapshot.sample.state[0] - (snapshot.linearState?.[0] ?? 0),
                snapshot.sample.state[1] - (snapshot.linearState?.[1] ?? 0)
              )
            )
          ],
          ...(snapshot.modes ?? []).map(
            (mode, i) =>
              [
                `모드 ${i + 1}: Ω (rad/s), 형상 (1, r)`,
                `${number(mode.frequency)}; (1, ${number(mode.shape[1])})`
              ] as const
          )
        ]),
        element(
          document,
          'p',
          '',
          '동일 초기조건의 선형 예측과 실제 비선형 해를 비교합니다. 초기 각도의 비를 모드 형상에 맞추고, 그 비를 유지하며 진폭을 키워 보세요.'
        )
      );
    } else if (plot === 'energy-exchange') {
      block.append(
        element(document, 'h3', '', '좌표별 에너지와 결합 에너지'),
        timePlot('에너지 교환', 'E (J)', [
          ['E₁', (f) => f.diagnostics.energyTerms.link1],
          ['E₂', (f) => f.diagnostics.energyTerms.link2],
          ['교차', (f) => f.diagnostics.energyTerms.coupling]
        ]),
        values(document, [
          [
            'E₁ / E₂ / 교차 (J)',
            [d.energyTerms.link1, d.energyTerms.link2, d.energyTerms.coupling].map(number).join(' / ')
          ],
          ['E − E최저 (J)', number(d.energyTerms.totalAboveMinimum)],
          [
            '표시 표본 전체에서 최대 총에너지 변화 (J)',
            number(
              Math.max(
                ...snapshot.series.map((frame) =>
                  Math.abs(frame.sample.energy.total - snapshot.series[0]!.sample.energy.total)
                )
              )
            )
          ]
        ]),
        element(
          document,
          'p',
          '',
          'E₁·E₂는 각좌표별로 묶은 에너지입니다. 각 질점에 유일하게 귀속되는 에너지나 각각 보존되는 양은 아닙니다.'
        )
      );
    } else if (plot === 'sensitivity') {
      block.append(
        element(document, 'h3', '', '가까운 두 초기조건의 분리'),
        timePlot('두 궤적의 첫 각도', 'θ₁ (rad)', [
          ['기준', (frame) => frame.sample.state[0]],
          ['이웃', (frame) => frame.nearbyState?.[0] ?? 0]
        ]),
        timePlot('위상 상태 거리', 'd (1)', [['거리', (f) => f.distance ?? 0]]),
        timePlot('유한시간 성장률', 'λt (1/s)', [['성장률', (f) => f.growthRate ?? Number.NaN]]),
        values(document, [
          ['현재 거리 (1)', number(snapshot.distance ?? 0)],
          [
            '현재 유한시간 성장률 (1/s)',
            snapshot.growthRate == null ? '시간 0 또는 거리 0에서 정의되지 않음' : number(snapshot.growthRate)
          ],
          ['이웃 궤적 (θ₁, θ₂) rad', (snapshot.nearbyState?.slice(0, 2) ?? []).map(number).join(', ')]
        ]),
        element(
          document,
          'p',
          '',
          '첫 각도에 10⁻⁶ rad를 더한 같은 모델을 함께 실행합니다. 거리는 감은 각도/rad와 각속도/(1 rad/s)의 유클리드 거리입니다. 재규격화하지 않은 유한시간 값이며 양수만으로 카오스를 확정하지 않습니다.'
        )
      );
    }
    root.append(block);
  }
  return root;
}
