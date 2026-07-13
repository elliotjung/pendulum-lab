import { pageDom as dom } from './DomBinder';

/** Everything the Lab header/diagnostics chrome needs for one refresh. */
export interface LabChromeSnapshot {
  time: number;
  energy: number;
  initialEnergy: number;
  drift: number;
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
  modeLabel: string;
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
  set('tStat', `${s.time.toFixed(2)} s`);
  set('th1Stat', `${st[0]!.toFixed(3)} / ${st[s.w1Index]!.toFixed(2)}`);
  set('th2Stat', `${st[1]!.toFixed(3)} / ${st[s.w2Index]!.toFixed(2)}`);
  set('eStat', `${s.initialEnergy.toFixed(3)} / ${s.energy.toFixed(3)}`);
  const driftEl = dom.el('driftStat');
  if (driftEl) {
    driftEl.textContent = s.drift.toExponential(2);
    driftEl.className = `sval ${s.drift > 1e-2 ? 'bad' : s.drift > 1e-4 ? 'warn' : 'good'}`;
  }
  set('lyapStat', `${s.lambdaMax.toFixed(4)} /s`);
  set(
    'dPoinc',
    `${s.poincare.size}/${s.poincare.capacity} ${s.poincare.direction}${s.poincare.refined ? ' refined' : ' linear'}`
  );
  set('modeLabel', s.modeLabel);
}
