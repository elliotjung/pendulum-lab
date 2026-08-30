import { pageDom as dom } from './DomBinder';
import { presentLabCanvasSummaries } from './LabAccessibilityPresenter';

/** Everything the Lab header/diagnostics chrome needs for one refresh. */
export interface LabChromeSnapshot {
  time: number;
  energy: number;
  initialEnergy: number;
  drift: number;
  /** Linear damping gamma; energy change is physical when this is positive. */
  damping: number;
  state: ArrayLike<number>;
  w1Index: number;
  w2Index: number;
  fps: number;
  physicsMs: number;
  renderMs: number;
  workerMs: number;
  qualityMode: string;
  qualityReason: string;
  dprCap: number;
  backend: 'offscreen' | 'main';
  lambdaMax: number;
  poincare: { size: number; capacity: number; direction: string; refined: boolean };
  timingDebtSeconds: number;
  droppedSimulationSeconds: number;
  longTaskCount: number;
  longTaskMs: number;
  phasePoints: number;
  spectrumSamples: number;
  angleTimeSamples: number;
  modeLabel: string;
}

export function interpretLyapunov(lambdaMax: number, korean = false): string {
  if (!Number.isFinite(lambdaMax)) return korean ? 'λ₁을 아직 계산할 수 없습니다.' : 'λ₁ is not available yet.';
  if (lambdaMax > 0) {
    const eFolding = 1 / lambdaMax;
    const doubling = Math.LN2 / lambdaMax;
    return korean
      ? `λ₁=${lambdaMax.toFixed(4)} s⁻¹: 작은 초기 오차가 약 ${eFolding.toFixed(2)}초마다 e배, ${doubling.toFixed(2)}초마다 2배로 증가한다는 유한시간 추정입니다. 시간 구간과 dt를 바꾸어 안정성을 확인하세요.`
      : `λ₁=${lambdaMax.toFixed(4)} s⁻¹: a finite-time estimate in which small initial errors grow by e in about ${eFolding.toFixed(2)} s (double in ${doubling.toFixed(2)} s). Check stability across horizon and dt.`;
  }
  return korean
    ? `λ₁=${lambdaMax.toFixed(4)} s⁻¹: 이 유한시간 구간에서는 지수적 분리가 확인되지 않았습니다. 이는 모든 시간에서 비혼돈임을 증명하지 않습니다.`
    : `λ₁=${lambdaMax.toFixed(4)} s⁻¹: no exponential separation is resolved over this finite window. This does not prove regular motion for every horizon.`;
}

export function interpretEnergyDrift(drift: number, damping: number, korean = false): string {
  const raw = Number.isFinite(drift) ? drift.toExponential(2) : 'unavailable';
  if (damping > 0)
    return korean
      ? `|ΔE/E₀|=${raw}: γ=${damping}인 감쇠계에서는 기계적 에너지 감소가 물리적입니다. 에너지 보존만으로 적분기 정확도를 판정하지 마세요.`
      : `|ΔE/E₀|=${raw}: with damping γ=${damping}, mechanical-energy loss is physical. Do not use conservation alone to judge integrator accuracy.`;
  return korean
    ? `|ΔE/E₀|=${raw}: 비감쇠 실행의 수치 보존 지표입니다. 절대 정확도의 증명이 아니므로 같은 시간 구간에서 dt 절반 비교를 수행하세요.`
    : `|ΔE/E₀|=${raw}: a numerical conservation diagnostic for this undamped run, not proof of absolute accuracy. Repeat the same horizon with dt halved.`;
}

/**
 * Fill the header/diagnostics chrome DOM from a modern-state snapshot. The
 * legacy runtime used to do this from its frame loop; once `js/` is removed
 * this is the only writer of these fields. Extracted from `LabApp` so the
 * frame loop stays free of DOM formatting.
 */
export function presentLabChrome(s: LabChromeSnapshot): void {
  const set = (id: string, text: string): void => dom.setText(id, text);
  const st = s.state;
  set('fpsBadge', `${s.fps.toFixed(0)} fps`);
  set('dPhys', s.physicsMs.toFixed(2));
  set('dRender', s.renderMs.toFixed(2));
  set('dWorker', s.workerMs.toFixed(2));
  set('dQuality', s.qualityMode);
  set('dQualityReason', s.qualityReason);
  set('dDpr', s.dprCap.toFixed(1));
  set('dBackend', s.backend);
  set('dTimeDebt', `${s.timingDebtSeconds.toFixed(3)} s`);
  set('dDroppedTime', `${s.droppedSimulationSeconds.toFixed(3)} s`);
  set('dLongTasks', `${s.longTaskCount} / ${s.longTaskMs.toFixed(0)} ms`);
  set('tStat', `${s.time.toFixed(2)} s`);
  set('th1Stat', `${st[0]!.toFixed(3)} / ${st[s.w1Index]!.toFixed(2)}`);
  set('th2Stat', `${st[1]!.toFixed(3)} / ${st[s.w2Index]!.toFixed(2)}`);
  set('eStat', `${s.initialEnergy.toFixed(3)} / ${s.energy.toFixed(3)}`);
  const driftEl = dom.el('driftStat');
  if (driftEl) {
    driftEl.textContent = s.drift.toExponential(2);
    const conservative = s.damping === 0;
    driftEl.className =
      `sval ${conservative ? (s.drift > 1e-2 ? 'bad' : s.drift > 1e-4 ? 'warn' : 'good') : ''}`.trim();
    driftEl.title = conservative
      ? 'Relative energy drift (conservative-run numerical diagnostic)'
      : `Mechanical energy change includes physical dissipation because damping gamma=${s.damping}.`;
  }
  set('lyapStat', `${s.lambdaMax.toFixed(4)} /s`);
  const korean = typeof document !== 'undefined' && document.documentElement.lang === 'ko';
  const lyapunovInterpretation = interpretLyapunov(s.lambdaMax, korean);
  const energyInterpretation = interpretEnergyDrift(s.drift, s.damping, korean);
  set('lyapInterpretation', lyapunovInterpretation);
  set('driftInterpretation', energyInterpretation);
  set('workflowMeasurement', `${lyapunovInterpretation} ${energyInterpretation}`);
  set(
    'dPoinc',
    `${s.poincare.size}/${s.poincare.capacity} ${s.poincare.direction}${s.poincare.refined ? ' refined' : ' linear'}`
  );
  set('modeLabel', s.modeLabel);
  presentLabCanvasSummaries(s);
}
