/**
 * 3D-lab export actions: trajectory CSVs and paper-ready snapshot bundles
 * (scene PNG + diagnostics JSON with reproducibility hashes) for the
 * double-string, spherical pendulum, and spherical-chain cards.
 */
import { DoubleStringPendulum } from '../../physics/doubleString';
import { SphericalChain } from '../../physics/sphericalChain';
import { downloadBytes, downloadJson } from '../../export/manifest';
import { dataUrlToBytes, textToBytes } from '../../research/zipBundle';
import { hashText } from '../../research/researchExportUtils';
import { clampNumber } from './storage-sync';
import { $, numberFrom, toast } from './shared';
import { logResearchRun } from './research-workbench';
import { attachBadge } from '../resultBadges';
import { lab3d } from './lab3d-render-loop';
import { doubleStringSpec, lab3dDoubleStringInitialState, lab3dDoubleStringParams } from './lab3d-double-string-ui';
import { chainSpec, lab3dChainInitialState, lab3dChainMethod, lab3dChainParams } from './lab3d-spherical-chain-ui';

/** Record a finite hybrid trajectory (with phase/tension columns) as CSV. */
export function exportDoubleStringTrajectoryCsv(): void {
  const params = lab3dDoubleStringParams();
  const [theta1, theta2, omega1, omega2] = lab3dDoubleStringInitialState();
  const horizon = clampNumber(numberFrom('ds3ExportT', 20), 20, 1, 120);
  const sim = new DoubleStringPendulum(params, theta1, theta2, omega1, omega2);
  const sample = 0.01;
  const rows = ['time,phase,theta1,theta2,omega1,omega2,x1,y1,x2,y2,tension1,tension2,energy'];
  const steps = Math.round(horizon / sample);
  for (let i = 0; i < steps; i += 1) {
    sim.step(sample);
    const s = sim.snapshot();
    rows.push(
      [
        s.time.toPrecision(8),
        s.phase,
        s.theta1.toPrecision(8),
        s.theta2.toPrecision(8),
        s.omega1.toPrecision(8),
        s.omega2.toPrecision(8),
        s.x1.toPrecision(8),
        s.y1.toPrecision(8),
        s.x2.toPrecision(8),
        s.y2.toPrecision(8),
        s.tension1.toPrecision(6),
        s.tension2.toPrecision(6),
        s.energy.toPrecision(10)
      ].join(',')
    );
  }
  downloadBytes('pendulum_double_string_trajectory.csv', textToBytes(rows.join('\n')), 'text/csv');
  logResearchRun(
    'export',
    'Double-string trajectory CSV',
    `${steps} samples over ${horizon}s with phase + tension columns; ${sim.events.length} hybrid events`,
    'pendulum_double_string_trajectory.csv'
  );
  toast('Double-string trajectory CSV exported');
}

/** Paper-ready double-string snapshot: scene PNG + diagnostics/events JSON. */
export function exportDoubleStringSnapshot(): void {
  const canvas = $('ds3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.doubleString) {
    toast('Run the double string pendulum first');
    return;
  }
  downloadBytes('pendulum_double_string_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const snapshot = lab3d.doubleString.snapshot();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: 'double-string-pendulum',
    spec: doubleStringSpec(),
    snapshot,
    events: lab3d.doubleString.events,
    reproducibilityHash: hashText(JSON.stringify({ spec: doubleStringSpec(), snapshot }))
  };
  downloadJson('pendulum_double_string_diagnostics.json', payload);
  logResearchRun(
    'export',
    'Double-string snapshot',
    `phase=${snapshot.phase}, ${lab3d.doubleString.events.length} hybrid events, E=${snapshot.energy.toFixed(4)} J`,
    'pendulum_double_string_snapshot.png'
  );
  toast('Double-string snapshot exported (PNG + JSON)');
}

/** Record a finite trajectory of the current chain and download it as CSV. */
export function exportChainTrajectoryCsv(): void {
  const params = lab3dChainParams();
  const n = params.masses.length;
  const dt = clampNumber(numberFrom('d3Dt', 0.001), 0.001, 0.0001, 0.01);
  const horizon = clampNumber(numberFrom('d3ExportT', 20), 20, 1, 120);
  const sampleEvery = Math.max(1, Math.round(0.01 / dt));
  const sim = new SphericalChain(params, lab3d.chain ? lab3d.chain.current() : lab3dChainInitialState(), {
    dt,
    method: lab3dChainMethod()
  });
  const header = [
    'time',
    ...Array.from({ length: n }, (_, k) => [
      `theta${k + 1}`,
      `phi${k + 1}`,
      `thetaDot${k + 1}`,
      `phiDot${k + 1}`
    ]).flat(),
    'energy',
    'lz'
  ];
  const rows: string[] = [header.join(',')];
  const steps = Math.round(horizon / (dt * sampleEvery));
  for (let i = 0; i < steps; i += 1) {
    sim.step(dt * sampleEvery);
    const state = sim.current();
    const diag = sim.diagnostics();
    const cols: number[] = [diag.time];
    for (let k = 0; k < n; k += 1) {
      cols.push(state[2 * k] ?? 0, state[2 * k + 1] ?? 0, state[2 * n + 2 * k] ?? 0, state[2 * n + 2 * k + 1] ?? 0);
    }
    cols.push(diag.energy, diag.lz);
    rows.push(cols.map((value) => value.toPrecision(10)).join(','));
  }
  const csv = rows.join('\n');
  downloadBytes(`pendulum_spherical_chain_n${n}_trajectory.csv`, textToBytes(csv), 'text/csv');
  logResearchRun(
    'export',
    `3D chain trajectory CSV (N=${n})`,
    `${steps} samples over ${horizon}s, dt=${dt}, method=${lab3dChainMethod()}`,
    `pendulum_spherical_chain_n${n}_trajectory.csv`
  );
  toast('Chain trajectory CSV exported');
}

/** Paper-ready chain snapshot: scene PNG + diagnostics JSON with repro hash. */
export function exportChainSnapshot(): void {
  const canvas = $('d3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.chain) {
    toast('Run the spherical chain first');
    return;
  }
  downloadBytes('pendulum_spherical_chain_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const diag = lab3d.chain.diagnostics();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: `spherical-chain-n${lab3d.chain.params.masses.length}`,
    spec: chainSpec(),
    state: Array.from(lab3d.chain.current()),
    diagnostics: diag,
    camera: lab3d.chainCamera.state(),
    reproducibilityHash: hashText(
      JSON.stringify({ spec: chainSpec(), state: Array.from(lab3d.chain.current()), dt: diag.dt, method: diag.method })
    )
  };
  downloadJson('pendulum_spherical_chain_diagnostics.json', payload);
  attachBadge('d3Readout', 'publication-ready', 'Snapshot ships spec, state, dt, method and a reproducibility hash.', {
    title: '3D Chain Snapshot Trust',
    source: '3D Lab -> exportChainSnapshot',
    parameters: {
      system: payload.system,
      dt: diag.dt,
      method: diag.method,
      chainLinks: lab3d.chain.params.masses.length
    },
    uncertainty: `energyDrift=${diag.energyDrift.toExponential(3)}, lzDrift=${diag.lzDrift.toExponential(3)}.`,
    externalValidation: 'Snapshot JSON includes spec, state, diagnostics, camera, and reproducibility hash.',
    reproduce: 'Re-import the JSON state/spec and rerun the spherical-chain diagnostics.',
    caveat: 'PNG is a rendered view; the JSON payload is the scientific artifact.',
    artifact: 'pendulum_spherical_chain_diagnostics.json',
    hash: payload.reproducibilityHash
  });
  logResearchRun(
    'export',
    `3D chain snapshot (N=${lab3d.chain.params.masses.length})`,
    `E drift ${diag.energyDrift.toExponential(2)}, Lz drift ${diag.lzDrift.toExponential(2)}, method=${diag.method}`,
    'pendulum_spherical_chain_snapshot.png'
  );
  toast('Chain snapshot exported (PNG + JSON)');
}

/** Export a paper-ready 3D diagnostic snapshot: PNG of the scene + JSON diagnostics. */
export function exportSphereSnapshot(): void {
  const canvas = $('s3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.sphere) {
    toast('Run the spherical pendulum first');
    return;
  }
  downloadBytes('pendulum_3d_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const diag = lab3d.sphere.diagnostics();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: 'spherical-pendulum',
    params: lab3d.sphere.params,
    state: lab3d.sphere.current(),
    diagnostics: diag,
    camera: lab3d.camera.state(),
    poincarePoints: lab3d.spherePoincare.length,
    reproducibilityHash: hashText(
      JSON.stringify({ params: lab3d.sphere.params, state: lab3d.sphere.current(), dt: diag.dt })
    )
  };
  downloadJson('pendulum_3d_diagnostics.json', payload);
  logResearchRun(
    'export',
    '3D diagnostic snapshot',
    `spherical pendulum, E drift ${diag.energyDrift.toExponential(2)}, Lz drift ${diag.lzDrift.toExponential(2)}`,
    'pendulum_3d_snapshot.png'
  );
  toast('3D snapshot exported (PNG + JSON)');
}
