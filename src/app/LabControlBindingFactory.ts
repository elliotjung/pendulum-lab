import type { RuntimeSnapshot } from '../types/domain';
import { legacyApp } from '../runtime/legacyCompat';
import { stateStore } from '../state/StateStore';
import { downloadText, poincareCsv, runJson, trajectoryCsv } from './labExport';
import { pageDom as dom } from './DomBinder';
import type { AudioSonifier } from './AudioSonifier';
import type { LabControlBindings } from './LabControls';
import type { LabEnsembleController } from './LabEnsembleController';
import type { LabMainSurface } from './LabMainSurface';
import type { LabQualityBudget } from './LabQualityBudget';
import type { LabReplayController } from './LabReplayController';
import type { LabSimulation } from './LabSimulation';
import type { PoincareAccumulator } from './PoincareAccumulator';

export interface LabControlBindingHost {
  sim(): LabSimulation;
  requestedStepsPerFrame(): number;
  isRunning(): boolean;
  setRunning(running: boolean): void;
  reset(): void;
  restoreSnapshot(snapshot: RuntimeSnapshot): void;
  setScrubIndex(index: number): void;
  setAngles(angles: number[], resume: boolean): void;
  refreshPresentation(): void;
  refreshEnsembleRendering(): void;
  quality: LabQualityBudget;
  ensemble: LabEnsembleController;
  mainSurface: LabMainSurface;
  poincare: PoincareAccumulator;
  replay: LabReplayController;
  audio: AudioSonifier;
}

/** Translate the Lab's collaborators into the narrow action API owned by LabControls. */
export function createLabControlBindings(host: LabControlBindingHost): LabControlBindings {
  const config = () => host.sim().config;
  return {
    reset: host.reset,
    restoreSnapshot: host.restoreSnapshot,
    applyQualityMode: () => host.quality.setMode(host.quality.readMode(), 'manual'),
    trimEnsembleToQuality: () => host.ensemble.trimToCap(host.quality.profile().ensembleCap),
    clearTrail: () => host.mainSurface.clear(),
    clearPoincare: () => host.poincare.clear(),
    toggleRunning: () => {
      if (host.replay.active) {
        host.replay.forceResumeOnExit();
        host.setScrubIndex(-1);
      } else host.setRunning(!host.isRunning());
    },
    refreshPresentation: host.refreshPresentation,
    refreshEnsembleRendering: host.refreshEnsembleRendering,
    exportTrajectory: () =>
      downloadText(
        'pendulum_modern_trajectory.csv',
        trajectoryCsv(host.replay.samples(), config().system, host.replay.retentionMetadata()),
        'text/csv'
      ),
    exportPoincare: () => downloadText('pendulum_modern_poincare.csv', poincareCsv(host.poincare.list()), 'text/csv'),
    exportJson: () => {
      const simulation = host.sim();
      const snapshot = simulation.snapshot();
      const seed = dom.num('seed', Number.NaN);
      downloadText(
        'pendulum_modern_run.json',
        JSON.stringify(
          runJson(config(), snapshot.state, snapshot.time, snapshot.energy, snapshot.drift, {
            mode: legacyApp()?.runMode ?? stateStore.snapshot().mode,
            stepsPerFrame: host.requestedStepsPerFrame(),
            seed: Number.isFinite(seed) ? seed : null,
            locale: document.documentElement.lang === 'ko' ? 'ko' : 'en',
            trajectoryRetention: host.replay.retentionMetadata()
          }),
          null,
          2
        ),
        'application/json'
      );
    },
    exportPng: () => host.mainSurface.exportPng(),
    scrubLength: () => host.replay.length,
    setScrubIndex: host.setScrubIndex,
    scrubLabel: (index) => host.replay.label(index),
    rewindScrub: () => {
      if (host.replay.length > 0) host.setScrubIndex(0);
    },
    setAudioEnabled: (enabled) => host.audio.setEnabled(enabled),
    setAudioVolume: (volume) => host.audio.setVolume(volume),
    drag: {
      rendererSize: () => host.mainSurface.rendererSize(),
      bobPixels: () => host.mainSurface.bobPixels(config(), host.sim().stateView()),
      pivot: () => host.mainSurface.pivot(),
      stateAngles: () => {
        const state = host.sim().stateView();
        return config().system === 'triple' ? [state[0]!, state[1]!, state[2]!] : [state[0]!, state[1]!];
      },
      setAngles: host.setAngles,
      beginDrag: () => {
        const wasRunning = host.isRunning();
        host.setRunning(false);
        return wasRunning;
      },
      endDrag: host.setRunning
    }
  };
}
