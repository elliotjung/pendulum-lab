import { fftInPlace } from '../../../../physics/fft';
import { relativeEnergyDrift } from '../../../../physics/energy';
import { naffDecompose } from '../../../../chaos/naff';
import { zeroOneTest } from '../../../../chaos/zeroOneTest';
import type { CoreDiagnosticRequest, CoreDiagnosticResult } from './contracts';
import { numeric } from './settings';
import { selectedSignal } from './validation';
import { diagnosticResult } from './result';

export function runSignalDiagnostic(request: CoreDiagnosticRequest): CoreDiagnosticResult {
  const { kind, series, settings: s } = request,
    warnings = [...series.warnings];
  if (kind === 'energy') {
    const energies = series.energy!,
      initial = energies[0]!,
      final = energies.at(-1)!;
    const relative = relativeEnergyDrift({ total: initial, KE: 0, PE: 0 }, { total: final, KE: 0, PE: 0 });
    warnings.push(
      '에너지 변화에는 감쇠·외력·제어에 의한 물리적 일이 포함될 수 있습니다. 소산·공급 일 균형 없이 이를 수치 오차로 해석하지 마세요.'
    );
    return diagnosticResult(
      kind,
      `기록된 에너지 ${energies.length}개 · 처음 대비 변화 ${(final - initial).toPrecision(6)} ${series.energyUnit}`,
      [series.axisUnit === 'iteration' ? '반복' : '시간', '에너지', '처음 대비 변화'],
      [series.axisUnit, series.energyUnit!, series.energyUnit!],
      series.times.map((time, i) => [time, energies[i]!, energies[i]! - initial]),
      { initial, final, relativeChangeMagnitude: relative, scale: Math.abs(initial) || 1 },
      warnings,
      'native-energy-observations / relativeEnergyDrift'
    );
  }
  const signal = selectedSignal(series, s),
    coordinate = numeric(s, 'coordinate'),
    label = series.labels[coordinate]!,
    unit = series.units[coordinate]!;
  if (kind === 'state-time')
    return diagnosticResult(
      kind,
      `${label} 관측 ${signal.values.length}개`,
      [series.axisUnit === 'iteration' ? '반복' : '시간', label],
      [series.axisUnit, unit],
      signal.times.map((time, i) => [time, signal.values[i]!]),
      { coordinate },
      warnings,
      'native-observations'
    );
  if (kind === 'phase') {
    const second = numeric(s, 'phaseCoordinate');
    warnings.push('선택한 두 관측 좌표의 투영입니다. 정준 q/p 좌표나 위상 부피 보존을 자동으로 보장하지 않습니다.');
    return diagnosticResult(
      kind,
      `${label} / ${series.labels[second]} 위상 투영`,
      [label, series.labels[second]!],
      [unit, series.units[second]!],
      series.states.map((state) => [state[coordinate]!, state[second]!]),
      { coordinate, phaseCoordinate: second },
      warnings,
      'native-observation-projection'
    );
  }
  warnings.push(
    `균일 표본 간격 ${signal.dt} ${series.axisUnit} · 과도 구간 ${s.transient} ${series.axisUnit}. 유한 관측 길이·잡음·과표본화와 aliasing을 확인하세요.`
  );
  if (Math.max(...signal.values) - Math.min(...signal.values) <= 1e-14 * Math.max(1, ...signal.values.map(Math.abs)))
    warnings.push('관측 신호가 상수이거나 수치적으로 거의 일정합니다. 주파수·혼돈 정보를 제공하지 않을 수 있습니다.');
  if (kind === 'fft') {
    let n = 1;
    while (n < signal.values.length) n *= 2;
    const re = new Float64Array(n),
      im = new Float64Array(n),
      mean = signal.values.reduce((a, b) => a + b, 0) / signal.values.length;
    let gain = 0;
    signal.values.forEach((value, i) => {
      const window = s.window === 'hann' ? 0.5 * (1 - Math.cos((2 * Math.PI * i) / signal.values.length)) : 1;
      re[i] = (value - mean) * window;
      gain += window;
    });
    fftInPlace(re, im);
    const rows = Array.from({ length: n / 2 + 1 }, (_, i) => [
      i / (n * signal.dt),
      (Math.hypot(re[i]!, im[i]!) / gain) * (i === 0 || i === n / 2 ? 1 : 2)
    ]);
    warnings.push(
      '평균 제거 후 선택한 창을 적용한 단측 진폭입니다. 0 채움은 곡선을 촘촘하게 하며 관측 시간의 실제 분해능을 늘리지 않습니다.'
    );
    return diagnosticResult(
      kind,
      `FFT ${signal.values.length}표본 · 실제 관측 분해능 약 ${(1 / (signal.values.length * signal.dt)).toPrecision(4)} cycles/${series.axisUnit}`,
      ['주파수', '단측 진폭'],
      [series.axisUnit === 's' ? 'Hz' : `cycles/${series.axisUnit}`, unit],
      rows,
      {
        sampleCount: signal.values.length,
        fftLength: n,
        dt: signal.dt,
        meanRemoved: mean,
        window: s.window,
        coherentGain: gain,
        real: Array.from(re),
        imaginary: Array.from(im)
      },
      warnings,
      'physics/fft.fftInPlace'
    );
  }
  if (kind === 'naff') {
    const components = naffDecompose(
      signal.values,
      signal.values.map(() => 0),
      signal.dt,
      numeric(s, 'terms'),
      { refineIterations: numeric(s, 'refineIterations') }
    );
    warnings.push(
      '실수 관측을 복소수 허수부 0으로 전달합니다. ±주파수 쌍과 각 성분의 반진폭을 구분하세요. Hann 창을 사용하는 유한 구간 추정이며 인접 성분·확산에 민감합니다.'
    );
    return diagnosticResult(
      kind,
      `NAFF ${components.length}성분 · 각주파수`,
      ['각주파수', '복소 진폭 크기'],
      [`rad/${series.axisUnit}`, unit],
      components.map((c) => [c.frequency, c.amplitude]),
      { components, dt: signal.dt, samples: signal.values.length },
      warnings,
      'chaos/naff.naffDecompose'
    );
  }
  if (kind === 'zero-one') {
    const data = zeroOneTest(signal.values, {
      cSamples: numeric(s, 'cSamples'),
      ncutFraction: numeric(s, 'ncutFraction'),
      seed: numeric(s, 'seed')
    });
    warnings.push(
      'K≈1은 잡음에서도 나타납니다. 짧은 기록·과표본화·관측량 선택에 민감하며 카오스의 확정 판정이 아닙니다. CI는 시험 주파수 표본의 bootstrap이며 적분·측정 오차를 포함하지 않습니다.'
    );
    return diagnosticResult(
      kind,
      `K = ${data.K.toPrecision(6)} · bootstrap SE ${data.kStdError.toPrecision(4)} · 95% CI [${data.kCi95.map((x) => x.toPrecision(4)).join(', ')}]`,
      ['시험 주파수 c', 'Kc'],
      ['rad/sample', '1'],
      data.cValues.map((c, i) => [c, data.kValues[i]!]),
      { ...data, dt: signal.dt, samples: signal.values.length },
      warnings,
      'chaos/zeroOneTest.zeroOneTest'
    );
  }
  throw new RangeError('이 진단은 연속 모델 계산이 필요합니다.');
}
