export interface LabCanvasSummarySnapshot {
  time: number;
  energy: number;
  initialEnergy: number;
  drift: number;
  state: ArrayLike<number>;
  w1Index: number;
  w2Index: number;
  lambdaMax: number;
  poincare: { size: number };
  phasePoints: number;
  spectrumSamples: number;
  angleTimeSamples: number;
  modeLabel: string;
}

/**
 * Keep a concise text alternative synchronized with every live Lab canvas.
 * The nodes are referenced with aria-describedby rather than aria-live so a
 * 60 Hz simulation never floods a screen reader's announcement queue.
 */
export function presentLabCanvasSummaries(snapshot: LabCanvasSummarySnapshot): void {
  if (typeof document === 'undefined') return;
  const korean = document.documentElement.lang === 'ko';
  const state = snapshot.state;
  const drift = snapshot.drift.toExponential(2);
  const energyDelta = snapshot.energy - snapshot.initialEnergy;
  const summaries: Record<string, string> = korean
    ? {
        main: `${snapshot.modeLabel}. 시뮬레이션 시간 ${snapshot.time.toFixed(2)}초. θ₁ ${state[0]!.toFixed(3)}, θ₂ ${state[1]!.toFixed(3)} 라디안.`,
        energy: `초기 에너지 ${snapshot.initialEnergy.toFixed(3)}, 현재 에너지 ${snapshot.energy.toFixed(3)}, 변화 ${energyDelta.toExponential(2)}, 상대 변화 ${drift}.`,
        lyap: `현재 최대 랴푸노프 지수 ${snapshot.lambdaMax.toFixed(4)} 매초.`,
        phase: `위상 궤적 ${snapshot.phasePoints}개 점. 현재 각속도 ω₁ ${state[snapshot.w1Index]!.toFixed(3)}, ω₂ ${state[snapshot.w2Index]!.toFixed(3)}.`,
        thetaProjection: `래핑한 θ₁–θ₂ 각도 투영에 ${snapshot.spectrumSamples}개 시간 샘플. 현재 θ₁ ${state[0]!.toFixed(3)}, θ₂ ${state[1]!.toFixed(3)} 라디안.`,
        angleTime: `θ₁과 θ₂의 시간 기록 ${snapshot.angleTimeSamples}개 샘플. 시뮬레이션 시간 ${snapshot.time.toFixed(2)}초.`,
        poincare: `푸앵카레 단면에 정제된 교차점 ${snapshot.poincare.size}개.`,
        fft: `각도 기록 ${snapshot.spectrumSamples}개 샘플로 계산한 주파수 스펙트럼.`
      }
    : {
        main: `${snapshot.modeLabel}. Simulation time ${snapshot.time.toFixed(2)} seconds. Theta one ${state[0]!.toFixed(3)} and theta two ${state[1]!.toFixed(3)} radians.`,
        energy: `Initial energy ${snapshot.initialEnergy.toFixed(3)}, current energy ${snapshot.energy.toFixed(3)}, change ${energyDelta.toExponential(2)}, relative change ${drift}.`,
        lyap: `Current maximum Lyapunov exponent ${snapshot.lambdaMax.toFixed(4)} per second.`,
        phase: `${snapshot.phasePoints} phase-trajectory points. Current angular velocities: omega one ${state[snapshot.w1Index]!.toFixed(3)}, omega two ${state[snapshot.w2Index]!.toFixed(3)}.`,
        thetaProjection: `${snapshot.spectrumSamples} time samples in the wrapped theta-one versus theta-two angle projection. Current angles are ${state[0]!.toFixed(3)} and ${state[1]!.toFixed(3)} radians.`,
        angleTime: `${snapshot.angleTimeSamples} samples in the theta-one and theta-two time histories through ${snapshot.time.toFixed(2)} seconds.`,
        poincare: `${snapshot.poincare.size} refined crossings in the Poincare section.`,
        fft: `Frequency spectrum computed from ${snapshot.spectrumSamples} angle samples.`
      };
  for (const [canvasId, text] of Object.entries(summaries)) updateSummary(canvasId, text);
}

function updateSummary(canvasId: string, text: string): void {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const summaryId = `${canvasId}LiveSummary`;
  let summary = document.getElementById(summaryId);
  if (!summary) {
    summary = document.createElement('span');
    summary.id = summaryId;
    summary.className = 'v10-sr lab-canvas-summary';
    canvas.insertAdjacentElement('afterend', summary);
  }
  summary.textContent = text;
  const describedBy = new Set((canvas.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  describedBy.add(summaryId);
  canvas.setAttribute('aria-describedby', [...describedBy].join(' '));
}
