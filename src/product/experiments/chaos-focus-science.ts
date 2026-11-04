import { createPlanarSimulation } from '../adapters/physics/planar';
import { createDiagnosticSeries, createDiagnosticFlow } from '../adapters/analysis/core/source';
import { runCoreDiagnostic } from '../adapters/analysis/core/execute';
import { runAdvancedDiagnostic } from '../adapters/analysis/advanced/execute';
import { defaultCoreSettings } from '../adapters/analysis/core/settings';
import type { CoreDiagnosticKind, CoreDiagnosticResult, DiagnosticSeries } from '../adapters/analysis/core/contracts';
import type { AdvancedDiagnosticKind, AdvancedDiagnosticResult } from '../adapters/analysis/advanced/contracts';
import { delayEmbed } from '../../chaos/correlationDimension';
import { numericalJacobian } from '../../physics/variational';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
import {
  chaosFocusCanonical,
  chaosFocusConfig,
  chaosFocusFields,
  chaosFocusSettings,
  CHAOS_FOCUS_KINDS
} from './chaos-focus-config';

type Diagnostic = CoreDiagnosticResult | AdvancedDiagnosticResult;
type Table = ResearchFocusResult['tables'][number];
type Chart = ResearchFocusResult['charts'][number];
type Metric = ResearchFocusResult['metrics'][number];
const metric = (id: string, label: string, value: number, unit = '1'): Metric => ({ id, label, value, unit });
const details = (r: Diagnostic): Record<string, unknown> => r.details as Record<string, unknown>;
const native = (r: Diagnostic): Record<string, number> => details(r).native as Record<string, number>;

/** Exact shared adapter execution; companions always name their independently changed setting. */
export function executeChaosFocus(
  id: string,
  input: ResearchFields,
  progress: (fraction: number) => void = () => undefined
): ResearchFocusResult {
  const f = chaosFocusFields(id, input),
    config = chaosFocusConfig(id, f),
    canonical = chaosFocusCanonical(id, f);
  const simulation = createPlanarSimulation(config),
    samples = [simulation.snapshot()];
  let steps = 0;
  while (!simulation.done) {
    const sample = simulation.step();
    steps++;
    if (steps % config.sampleEvery! === 0) samples.push(sample);
    if (steps % 100 === 0) progress((0.35 * steps) / Math.ceil(config.duration / config.step));
  }
  const series = createDiagnosticSeries(canonical, samples),
    settings = chaosFocusSettings(id, f);
  const displayStride = Math.max(1, Math.ceil(series.times.length / 1200));
  const tables: Table[] = [
    {
      id: 'observed-run',
      title: '공용 이중진자 실제 기록 (표시 표는 최대 1200행)',
      columns: ['시간 (s)', 'theta1 (rad)', 'theta2 (rad)', 'omega1 (rad/s)', 'omega2 (rad/s)'],
      rows: series.times.flatMap((t, i) => (i % displayStride === 0 ? [[t, ...series.states[i]!]] : []))
    }
  ];
  const charts: Chart[] = [],
    metrics: Metric[] = [
      metric('observed-samples', '실제 기록 표본', series.times.length),
      metric('native-steps', '공용 엔진 적분 단계', steps)
    ];
  const warnings = [
    ...series.warnings,
    '짧고 제한된 교육 실험입니다. 기간·sampling·관측량·threshold 수렴을 확인하기 전에는 단일 수치로 카오스를 확정하지 마세요.'
  ];
  const execute = (
    kind: CoreDiagnosticKind | AdvancedDiagnosticKind,
    s: Record<string, number | string>,
    observed = series
  ): Diagnostic => {
    const request = {
      id: `learn-${id.replace('.', '_')}-${tables.length}`,
      kind,
      experiment: canonical,
      series: observed,
      settings: s
    };
    return ['rqa', 'recurrence-network', 'correlation-dimension', 'multifractal'].includes(kind)
      ? runAdvancedDiagnostic({ ...request, kind: kind as AdvancedDiagnosticKind })
      : runCoreDiagnostic({ ...request, kind: kind as CoreDiagnosticKind });
  };
  const append = (label: string, r: Diagnostic, s: Record<string, number | string>) => {
    const index = tables.length;
    tables.push({
      id: `diagnostic-${index}`,
      title: label,
      columns: r.columns.map((c, i) => `${c} (${r.units[i]})`),
      rows: r.rows
    });
    tables.push({
      id: `settings-${index}`,
      title: `${label} · 실제 분석 설정`,
      columns: ['설정', '값'],
      rows: Object.entries(s)
    });
    warnings.push(...r.warnings);
    if (r.rows.length && r.rows[0]!.length >= 2 && r.rows.length > 1)
      charts.push({
        id: `curve-${index}`,
        title: label,
        xLabel: `${r.columns[0]} (${r.units[0]})`,
        yLabel: `${r.columns[1]} (${r.units[1]})`,
        series: [{ label, points: r.rows.map((row) => ({ x: row[0]!, y: row[1]! })) }]
      });
  };
  const kind = CHAOS_FOCUS_KINDS[id]!;
  const primary = execute(kind, settings);
  append('현재 설정의 실제 분석', primary, settings);
  progress(0.55);
  switch (id) {
    case '5.1': {
      const values = series.states.map((s) => s[0]!),
        embedded = delayEmbed(values, 2, f.delay!);
      tables.push({
        id: 'configuration',
        title: '구성공간과 지연 embedding (같은 run)',
        columns: ['theta1 (rad)', 'theta2 (rad)', 'theta1(t+delay) (rad)'],
        rows: embedded.map((p, i) => [series.states[i]![0]!, series.states[i]![1]!, p[1]!])
      });
      charts.push(
        {
          id: 'configuration',
          title: '구성공간 투영',
          xLabel: 'theta1 (rad)',
          yLabel: 'theta2 (rad)',
          series: [{ label: '같은 기록', points: series.states.map((s) => ({ x: s[0]!, y: s[1]! })) }]
        },
        {
          id: 'delay-embedding',
          title: '앞방향 2차원 지연 embedding',
          xLabel: 'theta1(t) (rad)',
          yLabel: 'theta1(t+delay) (rad)',
          series: [{ label: 'native delayEmbed', points: embedded.map((p) => ({ x: p[0]!, y: p[1]! })) }]
        }
      );
      metrics.push(metric('embedded-points', 'embedding 뒤 표본', embedded.length));
      warnings.push(
        'theta와 omega의 투영은 정준 q,p 면적이 아닙니다. native delayEmbed는 앞방향 지연을 사용합니다. 지연 그림이 전체 상태의 일대일 재구성을 보증하지 않습니다.'
      );
      break;
    }
    case '5.2': {
      const other = { ...settings, window: settings.window === 'hann' ? 'none' : 'hann' };
      append('같은 run의 다른 창 함수', execute('fft', other), other);
      metrics.push(
        metric('nyquist', '기록 sampling의 Nyquist 주파수', 1 / (2 * f.step! * f.sampleEvery!), 'Hz'),
        metric('record-duration', '첫·끝 기록 시간차', series.times.at(-1)! - series.times[0]!, 's')
      );
      break;
    }
    case '5.3': {
      const fftSettings = defaultCoreSettings('fft');
      const fft = execute('fft', fftSettings);
      append('같은 물리 run의 FFT', fft, fftSettings);
      const fftPeak = fft.rows.reduce((a, b) => (b[1]! > a[1]! ? b : a));
      const naffPeak = primary.rows.reduce((a, b) => (b[1]! > a[1]! ? b : a));
      metrics.push(
        metric('fft-peak-hz', '실제 run의 FFT 최대 peak', fftPeak[0]!, 'Hz'),
        metric('naff-peak-hz', '실제 run의 NAFF 최대 성분 |omega|/2pi', Math.abs(naffPeak[0]!) / (2 * Math.PI), 'Hz')
      );
      warnings.push(
        '두 최대 성분이 동일 모드인지 확인해야 합니다. ±성분 순서는 같지 않을 수 있고 NAFF rad/s를 FFT Hz와 직접 빼지 않습니다.'
      );
      break;
    }
    case '5.4': {
      const other = { ...settings, direction: 'falling' };
      const companion = execute('poincare', other);
      append('같은 단면의 반대 교차 방향', companion, other);
      metrics.push(
        metric('crossings-rising', '상향 교차 수', primary.rows.length),
        metric('crossings-falling', '하향 교차 수', companion.rows.length)
      );
      const points = details(primary).points as number[][];
      charts.push({
        id: 'section-points',
        mode: 'scatter',
        title: '단면 위의 theta2·omega2',
        xLabel: 'theta2 (rad)',
        yLabel: 'omega2 (rad/s)',
        series: [{ label: '상향 교차', points: points.map((p) => ({ x: p[1]!, y: p[3]! })) }]
      });
      if (points.length > 1)
        charts.push({
          id: 'return-map',
          mode: 'scatter',
          title: '연속 교차의 theta2 return map',
          xLabel: 'theta2(n) (rad)',
          yLabel: 'theta2(n+1) (rad)',
          series: [{ label: '상향 return', points: points.slice(1).map((p, i) => ({ x: points[i]![1]!, y: p[1]! })) }]
        });
      warnings.push(
        '짧은 구간의 적은 교차는 주기·준주기·카오스의 구별에 부족할 수 있습니다. 점이 없거나 적은 결과도 실패가 아닌 관찰 기간의 한계입니다.'
      );
      break;
    }
    case '5.5':
    case '5.6': {
      const shortSettings = { ...settings, duration: f.duration! / 2 },
        short = execute('lyapunov', shortSettings);
      append('같은 초기조건의 절반 관찰 기간', short, shortSettings);
      const other = { ...settings, renormEvery: Math.max(1, Math.floor(f.renormEvery! / 2)) };
      append('같은 기간의 절반 재규격화 간격', execute('lyapunov', other), other);
      metrics.push(
        metric('largest-exponent', '현재 유한시간 첫 지수', primary.rows[0]![1]!, 's^-1'),
        metric(
          'exponent-sum',
          '계산한 지수의 합',
          primary.rows.reduce((sum, row) => sum + row[1]!, 0),
          's^-1'
        )
      );
      warnings.push(
        id === '5.5'
          ? 'count=1 변분/QR 지수입니다. 사용자 fitting window로 회귀하는 알고리즘이 아니며 관찰 기간 비교로 유한시간 의존성을 확인합니다.'
          : '각도·각속도는 비정준 좌표입니다. 유한시간 지수 합을 곧바로 0 또는 -감쇠상수로 놓을 수 없습니다. 전체 접선 부피 성장과 같은 좌표의 평균 발산을 비교해야 합니다.'
      );
      if (id === '5.6') {
        const flow = createDiagnosticFlow(canonical),
          jac = new Float64Array(16),
          scratch = new Float64Array(4),
          plus = new Float64Array(4),
          minus = new Float64Array(4);
        const divergence = series.states.map((state) => {
          numericalJacobian(flow.rhs, state, 4, jac, scratch, plus, minus);
          return jac[0]! + jac[5]! + jac[10]! + jac[15]!;
        });
        let integral = 0;
        for (let i = 1; i < divergence.length; i++)
          integral += ((divergence[i - 1]! + divergence[i]!) * (series.times[i]! - series.times[i - 1]!)) / 2;
        metrics.push(
          metric('mean-divergence', '같은 좌표의 기록 간격 평균 발산 (사다리꼴)', integral / f.duration!, 's^-1')
        );
        warnings.push(
          '발산은 공용 numericalJacobian의 trace를 기록 시각에 평가한 사다리꼴 근사입니다. QR 적분의 모든 내부 시각을 쓰지 않으므로 기록 간격을 줄여 비교하세요.'
        );
      }
      break;
    }
    case '5.7': {
      const other = { ...settings };
      append('동일 초기조건·기간의 FLI', execute('fli', other), other);
      metrics.push(metric('final-sali', '최종 SALI', details(primary).finalSali as number));
      const rows: number[][] = [];
      for (const dx of [-0.15, 0, 0.15])
        for (const dy of [-0.15, 0, 0.15]) {
          const theta1 = Math.max(-2.8, Math.min(2.5, f.theta1! - 0.15)) + dx + 0.15,
            theta2 = f.theta2! + dy;
          const experiment = chaosFocusCanonical(id, { ...f, theta1, theta2 });
          const a = runCoreDiagnostic({ id: `grid_sali_${rows.length}`, kind: 'sali', experiment, series, settings });
          const b = runCoreDiagnostic({ id: `grid_fli_${rows.length}`, kind: 'fli', experiment, series, settings });
          rows.push([theta1, theta2, details(a).finalSali as number, details(b).fli as number]);
          progress(0.55 + rows.length * 0.04);
        }
      tables.push({
        id: 'same-initial-grid',
        title: '동일9개 초기조건의 SALI·FLI (같은 기간·seed)',
        columns: ['theta1 (rad)', 'theta2 (rad)', '최종 SALI (1)', '최종 FLI (1)'],
        rows
      });
      metrics.push(metric('grid-points', '같은 기간으로 비교한 초기조건', rows.length));
      warnings.push(
        '9개 초기조건의 제한된 스캔이며 전체 basin 지도나 분류 인증이 아닙니다. 각도1과 기간을 바꾸어 지표의 오판 가능 영역을 탐색하세요. SALI와 FLI는 서로 정규화와 해석이 다릅니다.'
      );
      break;
    }
    case '5.8': {
      const other = { ...settings, coordinate: Number(settings.coordinate) === 0 ? 2 : 0 };
      const companion = execute('zero-one', other);
      append('같은 run의 다른 관측량', companion, other);
      metrics.push(
        metric('primary-k', '현재 관측량 K', details(primary).K as number),
        metric('other-coordinate-k', '다른 관측량 K', details(companion).K as number)
      );
      metrics.push(metric('primary-k-se', '시험 주파수 bootstrap SE', details(primary).kStdError as number));
      tables.push({
        id: 'k-interval',
        title: '시험 주파수 표본의 bootstrap 95% 구간',
        columns: ['하한 (1)', '상한 (1)'],
        rows: [details(primary).kCi95 as number[]]
      });
      break;
    }
    case '5.9': {
      const other = { ...settings, threshold: f.threshold! / 2 };
      append('같은 후보·참조에서 절반 거리 허용치', execute('shadowing', other), other);
      const horizon = details(primary).horizon;
      metrics.push(metric('threshold-crossed', '관찰 기간 안의 허용치 초과 (1=있음)', horizon === null ? 0 : 1));
      warnings.push(
        'null horizon은 현재 기간 내 미초과이며 무한 신뢰 시간을 뜻하지 않습니다. 후보 tolerance는 거리 문턱이며 적응형 적분기 rtol/atol이 아닙니다.'
      );
      break;
    }
    case '5.10':
    case '5.11': {
      const other = { ...settings, targetRecurrenceRate: Math.min(0.5, Number(settings.targetRecurrenceRate) * 1.5) };
      const companion = execute(kind, other);
      append('목표 재귀율을 1.5배로 한 비교', companion, other);
      const d = details(primary),
        matrix = d.matrix as number[],
        n = d.size as number;
      const recurrencePoints = matrix.flatMap((v, i) => (v ? [{ x: i % n, y: Math.floor(i / n) }] : []));
      const displayedPoints =
        recurrencePoints.length <= 2500
          ? recurrencePoints
          : Array.from(
              { length: 2500 },
              (_, i) => recurrencePoints[Math.round((i * (recurrencePoints.length - 1)) / 2499)]!
            );
      charts.push({
        id: 'recurrence-matrix',
        mode: 'scatter',
        title: '실제 재귀 연결 (최대 2500점 균일 추출)',
        xLabel: '지연 점 번호',
        yLabel: '지연 점 번호',
        series: [{ label: '재귀', points: displayedPoints }]
      });
      metrics.push(
        metric('epsilon', '실제 epsilon', id === '5.10' ? native(primary).epsilon! : (d.epsilon as number), 'rad'),
        metric(
          'comparison-epsilon',
          '비교 epsilon',
          id === '5.10' ? native(companion).epsilon! : (details(companion).epsilon as number),
          'rad'
        )
      );
      if (id === '5.10') {
        const uncertainty = d.uncertainty as Record<string, unknown>;
        const rows = ['recurrenceRate', 'determinism', 'laminarity', 'divergence', 'entropy', 'trappingTime'].map(
          (key) => {
            const value = uncertainty[key] as { mean: number; stdError: number };
            return [key, value.mean, value.stdError];
          }
        );
        tables.push({
          id: 'rqa-block-variability',
          title: '연속 block 변동 (독립 표본 CI 아님)',
          columns: ['지표', 'block 평균', 'block SE'],
          rows
        });
      }
      warnings.push(
        '목표 재귀율이 epsilon을 선택합니다. 목표율과 실제율은 이산 거리·동률과 Theiler 제외 때문에 다를 수 있습니다. 행렬 그림은 표시 상한을 적용합니다.'
      );
      warnings.push(
        '행렬 그림은 전체 재귀 연결 배열에서 균일한 간격으로 최대 2500개를 추출합니다. 실제 분석은 표시 전에 전체 제한된 점군으로 계산합니다.'
      );
      break;
    }
    case '5.12': {
      const other = { ...settings, dimension: Math.min(8, Number(settings.dimension) + 1) };
      const companion = execute(kind, other);
      append('embedding 차원을 하나 늘린 비교', companion, other);
      metrics.push(
        metric('estimated-d2', '현재 구간의 D2', native(primary).dimension!),
        metric('comparison-d2', '더 큰 embedding의 D2', native(companion).dimension!)
      );
      const fit = native(primary) as unknown as { fitRange: number[]; pairs: number; rSquared: number };
      tables.push({
        id: 'actual-fit-range',
        title: '공용 추정기의 실제 적합 범위·쌍 수',
        columns: ['반경 하한 (rad)', '반경 상한 (rad)', '유효 쌍 수 (1)', 'R² (1)'],
        rows: [[fit.fitRange[0]!, fit.fitRange[1]!, fit.pairs, fit.rSquared]]
      });
      const radii = native(primary) as unknown as { radii: number[]; correlationSums: number[] };
      charts.push({
        id: 'log-correlation',
        title: 'log C(r) 대 log(r / 1 rad) (양수 구간)',
        xLabel: 'log(r / 1 rad)',
        yLabel: 'log C(r)',
        series: [
          {
            label: '현재 점군',
            points: radii.radii.flatMap((r, i) =>
              radii.correlationSums[i]! > 0 ? [{ x: Math.log(r), y: Math.log(radii.correlationSums[i]!) }] : []
            )
          }
        ]
      });
      warnings.push(
        '두 embedding의 비슷한 기울기만으로 차원 포화나 plateau가 인증되지 않습니다. 실제 fitRange, 표본 쌍과 더 넓은 표본 길이 비교가 필요합니다.'
      );
      break;
    }
    case '5.13': {
      const other = { ...settings, maxSamples: Math.max(48, Math.floor(Number(settings.maxSamples) / 2)) };
      append('같은 원 기록의 절반 사용 표본', execute(kind, other), other);
      charts.push({
        id: 'singularity-spectrum',
        title: '유한 q 격자의 Legendre spectrum',
        xLabel: 'alpha',
        yLabel: 'f(alpha)',
        series: [{ label: '실제 점유 확률', points: primary.rows.map((row) => ({ x: row[3]!, y: row[4]! })) }]
      });
      warnings.push(
        '짧은 보존 진자 궤적의 점유 확률이며 점근 attractor의 multifractal spectrum 인증이 아닙니다. 음의 q·빈 상자 제외·유한차분 alpha와 표본 편향을 함께 보세요.'
      );
      break;
    }
  }
  progress(1);
  return {
    schema: 'pendulum-research-focus/v1',
    unitId: id,
    fields: f,
    canonical,
    metrics,
    tables,
    charts,
    warnings: [...new Set(warnings)]
  };
}

/** Independent, explicitly synthetic observations for analytic signal fixtures; never a second physics engine. */
export function chaosSyntheticTone(n = 256, dt = 0.1, frequency = 0.625): DiagnosticSeries {
  return {
    axisUnit: 's',
    labels: ['synthetic-tone', 'synthetic-derivative'],
    units: ['rad', 'rad/s'],
    times: Array.from({ length: n }, (_, i) => i * dt),
    states: Array.from({ length: n }, (_, i) => [
      Math.cos(2 * Math.PI * frequency * i * dt),
      -2 * Math.PI * frequency * Math.sin(2 * Math.PI * frequency * i * dt)
    ]),
    warnings: ['정확한 주파수를 정한 독립 합성 benchmark이며 실제 진자 궤적이 아닙니다.']
  };
}
