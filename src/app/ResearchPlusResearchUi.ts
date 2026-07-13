import { magneticPendulumBasinGrid, THREE_MAGNET_PRESET, type MagneticBasinGrid } from '../physics/magneticPendulum';
import { buildQkrFloquetViewModel } from '../research/qkrViewModel';
import { downloadText } from './labExport';
import {
  buildSynchronizationExploration,
  drawMagneticBasin,
  drawQkrSpectrum,
  drawSynchronization,
  magneticBasinCsv,
  magneticBasinFingerprint,
  type SynchronizationMode
} from './researchPlusModels';

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(id: string, testId: string, label: string): HTMLButtonElement {
  return node('button', { id, type: 'button', 'data-testid': testId }, label);
}

function status(id: string): HTMLParagraphElement {
  return node('p', { id, role: 'status', 'aria-live': 'polite', class: 'xs-10' });
}

function canvas(id: string, testId: string, label: string): HTMLCanvasElement {
  return node('canvas', { id, width: '600', height: '240', role: 'img', 'aria-label': label, 'data-testid': testId });
}

function card(testId: string, title: string, description: string): HTMLElement {
  const section = node('section', { class: 'research-card', 'data-testid': testId, 'aria-labelledby': `${testId}-title` });
  section.append(node('h3', { id: `${testId}-title` }, title), node('p', { class: 'xs-11' }, description));
  return section;
}

function numberControl(id: string, labelText: string, value: string, min: string, max: string, step: string): HTMLLabelElement {
  const label = node('label', { for: id }, labelText);
  label.append(node('input', { id, type: 'number', value, min, max, step, 'aria-label': labelText }));
  return label;
}

function installMagneticCard(root: HTMLElement): void {
  const section = card(
    'research-magnetic-card',
    'Three-magnet fractal basin',
    'Release the bob from a deterministic launch grid; colour records which magnet captures it and dim cells expose the finite settling budget.'
  );
  const plot = canvas('rpMagneticCanvas', 'research-magnetic-canvas', 'Three-magnet pendulum attraction basin');
  const run = button('rpMagneticRun', 'research-magnetic-run', 'Compute basin');
  const exportButton = button('rpMagneticCsv', 'research-magnetic-csv', 'Export basin CSV');
  exportButton.disabled = true;
  const output = status('rpMagneticStatus');
  let latest: MagneticBasinGrid | null = null;
  run.addEventListener('click', () => {
    run.disabled = true;
    output.textContent = 'Computing deterministic 18 × 18 launch grid…';
    setTimeout(() => {
      try {
        latest = magneticPendulumBasinGrid(THREE_MAGNET_PRESET, {
          n: 18,
          xRange: [-1.8, 1.8],
          yRange: [-1.8, 1.8],
          dt: 0.007,
          maxSteps: 3500,
          speedTolerance: 0.004
        });
        drawMagneticBasin(plot, latest);
        const fingerprint = magneticBasinFingerprint(latest);
        plot.dataset.fingerprint = fingerprint;
        output.textContent = `${latest.width * latest.height} launches · ${(100 * latest.convergedFraction).toFixed(1)}% settled · deterministic fingerprint ${fingerprint}`;
        exportButton.disabled = false;
      } catch (error) {
        output.textContent = `Basin error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        run.disabled = false;
      }
    }, 0);
  });
  exportButton.addEventListener('click', () => {
    if (latest) downloadText('magnetic-pendulum-three-magnet-basin.csv', magneticBasinCsv(latest), 'text/csv;charset=utf-8');
  });
  section.append(plot, run, exportButton, output);
  root.append(section);
}

function installQkrCard(root: HTMLElement): void {
  const section = card(
    'research-qkr-card',
    'Quantum kicked-rotor Floquet spectrum',
    'Diagonalize the split-step unitary and expose its wrapped quasi-energy bands. The unit-circle drift is reported as the numerical trust check.'
  );
  const controls = node('div', { class: 'row' });
  controls.append(
    numberControl('rpQkrKick', 'Kick strength K', '5', '0', '12', '0.1'),
    numberControl('rpQkrHbar', 'Effective Planck constant', '1.1', '0.1', '4', '0.05')
  );
  const plot = canvas('rpQkrCanvas', 'research-qkr-canvas', 'Quantum kicked rotor Floquet quasi-energy spectrum');
  const run = button('rpQkrRun', 'research-qkr-run', 'Compute quasi-energies');
  const output = status('rpQkrStatus');
  run.addEventListener('click', () => {
    const kickStrength = Number((section.querySelector('#rpQkrKick') as HTMLInputElement).value);
    const hbar = Number((section.querySelector('#rpQkrHbar') as HTMLInputElement).value);
    try {
      const model = buildQkrFloquetViewModel({ gridSize: 16, kickStrength, hbar });
      drawQkrSpectrum(plot, model);
      plot.dataset.bandCount = String(model.bands.length);
      output.textContent = `${model.bands.length} quasi-energies · ${model.backend} backend · max |‖λ‖−1| ${model.maxUnitCircleDrift.toExponential(2)} · ${model.caveat}`;
    } catch (error) {
      output.textContent = `Floquet error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  section.append(controls, plot, run, output);
  root.append(section);
}

function installSynchronizationCard(root: HTMLElement): void {
  const section = card(
    'research-sync-card',
    'Kuramoto synchronization and chimera explorer',
    'Compare global order r(t) with the Lorentzian continuum threshold Kc, or start a non-local ring from a coherent/incoherent coexistence seed.'
  );
  const controls = node('div', { class: 'row' });
  const modeLabel = node('label', { for: 'rpSyncMode' }, 'Network mode');
  const mode = node('select', { id: 'rpSyncMode', 'aria-label': 'Synchronization network mode', 'data-testid': 'research-sync-mode' });
  mode.append(node('option', { value: 'mean-field' }, 'Mean-field transition'), node('option', { value: 'chimera-seed' }, 'Non-local chimera seed'));
  modeLabel.append(mode);
  controls.append(modeLabel, numberControl('rpSyncCoupling', 'Coupling K', '1.4', '0', '4', '0.1'));
  const plot = canvas('rpSyncCanvas', 'research-sync-canvas', 'Kuramoto global order parameter over time');
  const run = button('rpSyncRun', 'research-sync-run', 'Run synchronization');
  const output = status('rpSyncStatus');
  run.addEventListener('click', () => {
    const coupling = Number((section.querySelector('#rpSyncCoupling') as HTMLInputElement).value);
    try {
      const result = buildSynchronizationExploration(coupling, mode.value as SynchronizationMode);
      drawSynchronization(plot, result);
      const finalOrder = result.order.at(-1) ?? 0;
      plot.dataset.finalOrder = finalOrder.toFixed(6);
      output.textContent = `r(0)=${result.order[0]!.toFixed(3)} → r(T)=${finalOrder.toFixed(3)} · Kc=${result.criticalCoupling.toFixed(3)} · local-order diagnosis: ${result.chimera.classification} (finite-size diagnostic)`;
    } catch (error) {
      output.textContent = `Synchronization error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  section.append(controls, plot, run, output);
  root.append(section);
}

export function installResearchPlusResearchUi(panel: HTMLElement): void {
  if (panel.querySelector('[data-research-plus-physics]')) return;
  const host = panel.querySelector<HTMLElement>('.left-col') ?? panel;
  const root = node('div', { 'data-research-plus-physics': '', 'aria-label': 'Extended research experiments' });
  installMagneticCard(root);
  installQkrCard(root);
  installSynchronizationCard(root);
  host.append(root);
}
