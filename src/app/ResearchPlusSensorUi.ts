import { ImuMotionCaptureController, type ImuAxis } from '../browser/imuMotionCapture';
import { VideoMarkerCaptureController } from '../browser/videoMarkerCapture';
import { fitDoublePendulumFromCsv } from '../research/experimentalDataImport';
import { downloadText } from './labExport';

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

function colorInput(id: string, labelText: string, value: string): HTMLLabelElement {
  const label = node('label', { for: id }, labelText);
  label.append(node('input', { id, type: 'color', value, 'aria-label': labelText }));
  return label;
}

function numberInput(id: string, labelText: string, value: string): HTMLLabelElement {
  const label = node('label', { for: id }, labelText);
  label.append(node('input', { id, type: 'number', value, min: '0', step: '1', 'aria-label': labelText }));
  return label;
}

function parseColor(input: HTMLInputElement): { red: number; green: number; blue: number; tolerance: number; minPixels: number } {
  const match = /^#([0-9a-f]{6})$/i.exec(input.value);
  if (!match) throw new Error('Marker colour must be a six-digit hex colour.');
  const value = Number.parseInt(match[1]!, 16);
  return { red: value >> 16, green: (value >> 8) & 255, blue: value & 255, tolerance: 55, minPixels: 6 };
}

function sensorCard(testId: string, title: string, description: string): HTMLElement {
  const section = node('section', { class: 'research-card', 'data-testid': testId, 'aria-labelledby': `${testId}-title` });
  section.append(node('h3', { id: `${testId}-title` }, title), node('p', { class: 'xs-11' }, description));
  return section;
}

function installCameraCard(root: HTMLElement, cleanup: Array<() => void>): void {
  const section = sensorCard(
    'research-camera-card',
    'Camera → colour markers → parameter fit',
    'Track two coloured bob markers in a live preview. Frames are timestamped and exported through the same time,theta1,theta2 CSV contract used by parameter estimation.'
  );
  const video = node('video', { id: 'rpCameraVideo', playsinline: '', muted: '', 'aria-label': 'Live camera source' });
  video.hidden = true;
  const preview = node('canvas', {
    id: 'rpCameraPreview', width: '320', height: '240', role: 'img',
    'aria-label': 'Camera colour-marker tracking preview', 'data-testid': 'research-camera-preview'
  });
  const controls = node('div', { class: 'row' });
  controls.append(
    colorInput('rpCameraFirstColor', 'First bob marker colour', '#ef2636'),
    colorInput('rpCameraSecondColor', 'Second bob marker colour', '#14dce6'),
    numberInput('rpCameraPivotX', 'Pivot x in preview pixels', '160'),
    numberInput('rpCameraPivotY', 'Pivot y in preview pixels', '24')
  );
  const start = button('rpCameraStart', 'research-camera-start', 'Start camera');
  const stop = button('rpCameraStop', 'research-camera-stop', 'Stop camera');
  const exportButton = button('rpCameraExport', 'research-camera-export', 'Export tracked CSV');
  const fit = button('rpCameraFit', 'research-camera-fit', 'Fit captured g');
  stop.disabled = true;
  exportButton.disabled = true;
  fit.disabled = true;
  const output = node('p', { id: 'rpCameraStatus', role: 'status', 'aria-live': 'polite', class: 'xs-10' }, 'Camera idle. HTTPS/localhost and explicit permission are required.');
  let controller: VideoMarkerCaptureController | null = null;

  start.addEventListener('click', async () => {
    controller?.cleanup();
    const first = section.querySelector<HTMLInputElement>('#rpCameraFirstColor')!;
    const second = section.querySelector<HTMLInputElement>('#rpCameraSecondColor')!;
    const pivotX = Number(section.querySelector<HTMLInputElement>('#rpCameraPivotX')!.value);
    const pivotY = Number(section.querySelector<HTMLInputElement>('#rpCameraPivotY')!.value);
    controller = new VideoMarkerCaptureController({
      video,
      canvas: preview,
      tracking: { pivot: { x: pivotX, y: pivotY }, first: parseColor(first), second: parseColor(second) },
      onStateChange: (state, message) => {
        output.textContent = message;
        start.disabled = state === 'requesting' || state === 'streaming';
        stop.disabled = state !== 'streaming';
      },
      onSample: (sample) => {
        const count = controller?.sampleCount() ?? 0;
        const context = preview.getContext('2d');
        if (context) {
          context.save();
          context.lineWidth = 3;
          [[sample.first, first.value], [sample.second, second.value]].forEach(([marker, color]) => {
            const point = marker as typeof sample.first;
            context.strokeStyle = String(color);
            context.beginPath();
            context.arc(point.x, point.y, 8, 0, 2 * Math.PI);
            context.stroke();
          });
          context.fillStyle = '#ffffff';
          context.font = '14px system-ui';
          context.fillText(`t=${sample.timestamp.toFixed(3)} s`, 8, 20);
          context.restore();
        }
        if (count % 10 === 0) output.textContent = `Camera active · t=${sample.timestamp.toFixed(3)} s · ${count} tracked frames (unmatched frames are skipped).`;
        exportButton.disabled = count < 2;
        fit.disabled = count < 6;
      }
    });
    await controller.start();
  });
  stop.addEventListener('click', () => {
    controller?.stop();
    start.disabled = false;
    stop.disabled = true;
  });
  exportButton.addEventListener('click', () => {
    if (controller) downloadText('double-pendulum-camera-observations.csv', controller.observationCsv(), 'text/csv;charset=utf-8');
  });
  fit.addEventListener('click', () => {
    if (!controller) return;
    try {
      const observation = controller.observation();
      const initial = observation.angles[0]!;
      const result = fitDoublePendulumFromCsv(controller.observationCsv(), {
        initialState: [initial[0], initial[1], 0, 0],
        base: { m1: 1, m2: 1, l1: 1, l2: 1, g: 8 },
        gamma: 0,
        estimate: ['g'],
        initialGuess: [8],
        dt: 0.005
      }, {}, { maxIterations: 25 });
      output.textContent = `Captured-data fit: ĝ=${(result.estimated.g ?? NaN).toFixed(4)} · RMSE=${result.rmse.toExponential(2)} · ${result.status}. Verify lengths and pixel pivot before interpreting g.`;
    } catch (error) {
      output.textContent = `Fit error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  cleanup.push(() => controller?.cleanup());
  section.append(controls, preview, video, start, stop, exportButton, fit, output);
  root.append(section);
}

function installImuCard(root: HTMLElement, cleanup: Array<() => void>): void {
  const section = sensorCard(
    'research-imu-card',
    'Smartphone IMU pendulum stream',
    'Collect calibrated inclination, angular velocity, and finite-difference angular acceleration. iOS permission is requested only from the Start button gesture.'
  );
  const axisLabel = node('label', { for: 'rpImuAxis' }, 'Rotation axis');
  const axis = node('select', { id: 'rpImuAxis', 'aria-label': 'Device motion rotation axis' });
  axis.append(node('option', { value: 'beta' }, 'beta (front/back)'), node('option', { value: 'gamma' }, 'gamma (left/right)'));
  axisLabel.append(axis);
  const start = button('rpImuStart', 'research-imu-start', 'Start motion sensor');
  const calibrate = button('rpImuCalibrate', 'research-imu-calibrate', 'Zero current angle');
  const stop = button('rpImuStop', 'research-imu-stop', 'Stop sensor');
  const exportButton = button('rpImuExport', 'research-imu-export', 'Export IMU CSV');
  calibrate.disabled = true;
  stop.disabled = true;
  exportButton.disabled = true;
  const output = node('p', { id: 'rpImuStatus', role: 'status', 'aria-live': 'polite', class: 'xs-10' }, 'Motion sensor idle. If unavailable, a previously exported CSV remains the fallback.');
  let controller: ImuMotionCaptureController | null = null;

  start.addEventListener('click', async () => {
    controller?.cleanup();
    controller = new ImuMotionCaptureController({
      axis: axis.value as ImuAxis,
      onStateChange: (state, message) => {
        output.textContent = message;
        const streaming = state === 'streaming';
        start.disabled = state === 'requesting' || streaming;
        calibrate.disabled = !streaming;
        stop.disabled = !streaming;
      },
      onSample: (sample) => {
        const count = controller?.series().length ?? 0;
        output.textContent = `IMU ${count} samples · θ=${sample.angle.toFixed(3)} rad · α=${sample.angularAcceleration.toFixed(3)} rad/s²`;
        exportButton.disabled = false;
      }
    });
    await controller.start();
  });
  calibrate.addEventListener('click', () => {
    controller?.calibrate();
    output.textContent = 'Current pose set to θ=0; subsequent samples use this calibration.';
  });
  stop.addEventListener('click', () => {
    controller?.stop();
    start.disabled = false;
    calibrate.disabled = true;
    stop.disabled = true;
  });
  exportButton.addEventListener('click', () => {
    if (controller) downloadText('pendulum-device-motion.csv', controller.exportCsv(), 'text/csv;charset=utf-8');
  });
  cleanup.push(() => controller?.cleanup());
  section.append(axisLabel, start, calibrate, stop, exportButton, output);
  root.append(section);
}

export function installResearchPlusSensorUi(panel: HTMLElement): void {
  if (panel.querySelector('[data-research-plus-sensors]')) return;
  const host = panel.querySelector<HTMLElement>('.left-col') ?? panel;
  const root = node('div', { 'data-research-plus-sensors': '', 'aria-label': 'Experimental sensor capture' });
  const cleanup: Array<() => void> = [];
  installCameraCard(root, cleanup);
  installImuCard(root, cleanup);
  window.addEventListener('pagehide', () => cleanup.forEach((callback) => callback()), { once: true });
  host.append(root);
}
