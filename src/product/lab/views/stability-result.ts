import { element } from '../../app/dom';
import type { StabilityArtifact, StabilityResult } from '../../adapters/analysis/stability/contracts';
import { STABILITY_NAMES } from '../../adapters/analysis/stability/contracts';
import { exportStabilityArtifact } from '../../adapters/analysis/stability/artifact';
import { createPlot } from './core-plots';
import { stabilitySourceNames, stabilityParameterNames } from './stability-settings';

export function stabilityTable(
  document: Document,
  label: string,
  headings: string[],
  rows: string[][],
  caption: string
) {
  const region = element(document, 'div', 'stability-table');
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', label);
  const table = element(document, 'table', '');
  table.append(element(document, 'caption', '', caption));
  const head = element(document, 'thead', ''),
    heading = element(document, 'tr', '');
  for (const title of headings) {
    const cell = element(document, 'th', '', title);
    cell.scope = 'col';
    heading.append(cell);
  }
  head.append(heading);
  const body = element(document, 'tbody', '');
  for (const values of rows.slice(0, 200)) {
    const row = element(document, 'tr', '');
    row.append(...values.map((value) => element(document, 'td', '', value)));
    body.append(row);
  }
  table.append(head, body);
  region.append(table);
  return region;
}
const number = (value: number) => value.toPrecision(8);

export function stabilityAttemptView(document: Document, result: StabilityResult) {
  const output = element(document, 'div', 'stability-attempt-result');
  output.append(
    element(document, 'h3', '', `${STABILITY_NAMES[result.kind]} 결과`),
    element(document, 'p', '', result.summary),
    element(document, 'p', 'lab-preview-note', `분석 대상: ${stabilitySourceNames[result.source] ?? result.source}`)
  );
  for (const warning of result.warnings) output.append(element(document, 'p', 'lab-preview-note', warning));
  if (result.branch.length) {
    const unit = result.source === 'current-driven' ? 'rad' : '1';
    const details =
      result.details && typeof result.details === 'object' && !Array.isArray(result.details) ? result.details : {};
    const parameter =
      result.source === 'current-driven'
        ? stabilityParameterNames[String(details.parameterName ?? 'forcingAmplitude')]!
        : result.source === 'delayed-logistic'
          ? '맵 매개변수 a (1)'
          : '정규형 매개변수 λ (1)';
    const coordinates = result.source === 'current-driven' ? 'θ (rad), ω (rad/s)' : '무차원 상태 좌표 (1)';
    output.append(
      createPlot(
        document,
        '가지 표본 · 첫 상태 좌표',
        parameter,
        `첫 상태 (${unit})`,
        [
          {
            label: '수렴',
            color: '#075985',
            points: result.branch.filter((p) => p.converged).map((p) => [p.parameter, p.state[0]!] as const)
          },
          {
            label: '미수렴',
            color: '#9a3412',
            points: result.branch.filter((p) => !p.converged).map((p) => [p.parameter, p.state[0]!] as const)
          }
        ],
        true
      ),
      element(
        document,
        'p',
        'lab-muted',
        '각 점은 계산한 가지 표본입니다. 점 사이를 보간하지 않습니다. 모든 상태 좌표·잔차·안정성 판정은 아래 표와 결과 파일에 있습니다.'
      ),
      stabilityTable(
        document,
        '해와 가지 표본',
        [parameter, coordinates, '잔차 · 성분 infinity norm', '수렴', '선형 안정성'],
        result.branch.map((point) => [
          number(point.parameter),
          point.state.map(number).join(', '),
          number(point.residual),
          point.converged ? '수렴' : '미수렴',
          point.stable === null ? '판정 없음' : point.stable ? '안정' : '불안정'
        ]),
        `가지 ${result.branch.length}개 중 처음 ${Math.min(200, result.branch.length)}개. 상태 순서와 단위는 분석 대상의 계약을 따릅니다.`
      )
    );
  } else if (result.columns.length >= 2 && result.rows.length > 1) {
    output.append(
      createPlot(
        document,
        '안정성 진단 표본',
        `${result.columns[0]} (${result.units[0]})`,
        `${result.columns[1]} (${result.units[1]})`,
        [
          { label: result.columns[1]!, color: '#075985', points: result.rows.map((row) => [row[0]!, row[1]!] as const) }
        ],
        true
      )
    );
  }
  if (result.rows.length)
    output.append(
      stabilityTable(
        document,
        '안정성 분석 결과 수치 표',
        result.columns.map((column, i) => `${column} (${result.units[i]})`),
        result.rows.map((row) => row.map(number)),
        `결과 ${result.rows.length}행 중 처음 ${Math.min(200, result.rows.length)}행. 전체 수치는 결과 파일에 보존합니다.`
      )
    );
  const log = element(document, 'details', 'lab-details');
  log.classList.add('stability-convergence-log');
  log.append(
    element(document, 'summary', '', '해 탐색 수렴 기록'),
    element(
      document,
      'p',
      'lab-muted',
      '각 행은 기존 계산기가 반환한 해 탐색 단계의 최종 잔차입니다. 내부 Newton 반복의 전체 이력을 제공하는 기록은 아닙니다.'
    ),
    stabilityTable(
      document,
      '해 탐색 단계별 최종 잔차',
      ['단계', '최종 잔차', '수렴'],
      result.log.map((entry) => [String(entry.step), number(entry.residual), entry.converged ? '수렴' : '미수렴']),
      result.log.length
        ? `${result.log.length}단계 중 처음 ${Math.min(200, result.log.length)}단계.`
        : '이 진단에는 해 탐색 보정 기록이 없습니다.'
    )
  );
  output.append(log);
  return output;
}

export function stabilityResultView(document: Document, artifact: StabilityArtifact) {
  const output = stabilityAttemptView(document, artifact.result);
  output.classList.add('stability-result');
  output.querySelector('.stability-convergence-log')!.id = 'stability-convergence-log';
  output.append(
    element(
      document,
      'p',
      'lab-muted',
      `입력 실험 snapshot ID: ${artifact.inputRunId} · 결과: ${artifact.artifactId} · ${artifact.createdAt}`
    ),
    element(
      document,
      'p',
      'lab-muted',
      `기준 실험: ${artifact.request.experiment.systemId}. 원래 실험 설정과 분석 대상·초기 추정·경고·해와 가지를 결과 파일에 보존합니다. 이 ID는 기록된 실행 궤적의 저장 식별자가 아닙니다.`
    )
  );
  if (artifact.request.restart)
    output.append(
      element(
        document,
        'p',
        'lab-muted',
        `이어 계산한 부모 결과: ${artifact.request.restart.artifactId}. 입력 실험 ID ${artifact.request.restart.inputRunId}와 원래 실험 설정을 유지했습니다.`
      )
    );
  const details = element(document, 'details', 'lab-details');
  details.append(
    element(document, 'summary', '', '전체 결과·설정·단위·계보 보기'),
    element(document, 'pre', 'stability-json', exportStabilityArtifact(artifact))
  );
  output.append(details);
  return output;
}
