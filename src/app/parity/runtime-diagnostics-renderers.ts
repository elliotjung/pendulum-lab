/** Focused diagnostics responsibility extracted from runtime-diagnostics.ts. */
/**
 * Diagnostics: validation surfaces, probes, audits, runtime panels, floating diag.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import type { IntegratorId, RuntimeSnapshot } from '../../types/domain';
import { commandRegistry } from '../../runtime/CommandRegistry';

import { integratorRegistry } from '../../physics/integrators';

import {
  LEGACY_VALIDATION_IDS,
  ModernLabHandle,
  append,
  button,
  clear,
  currentMethod,
  currentMode,
  currentSnapshot,
  currentSystem,
  html,
  kvGrid,
  modernLab,
  row,
  setText,
  state
} from './shared';

import { renderResearchWorkbench } from './research-workbench';
import { capabilityText, featureDomOk } from './governance-ui';
import { attachBadge, type ResultBadgeLevel } from '../resultBadges';
import {
  claimEvidenceRuntimeRows,
  claimEvidenceWarnings,
  currentClaimEvidenceSurface
} from '../../research/claimEvidenceSurfaces';

export function toggleFloatingDiag(): void {
  const diag = $('ueFloatingDiag');
  if (diag) diag.style.display = diag.style.display === 'none' ? 'block' : 'none';
}

export function installFloatingDiag(): void {
  if ($('ueFloatingDiag')) return;
  const box = html('div', { id: 'ueFloatingDiag' });
  const drawerHost = document.querySelector<HTMLElement>('#trustDrawer [data-trust-panel="performance"]');
  if (!drawerHost && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 560px)').matches)
    box.classList.add('collapsed');
  const header = html('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  const collapse = button('ueCollapse', '-', () => {
    box.classList.toggle('collapsed');
    collapse.setAttribute('aria-expanded', box.classList.contains('collapsed') ? 'false' : 'true');
  });
  collapse.setAttribute('aria-label', 'Toggle engine diagnostics');
  collapse.setAttribute('aria-expanded', box.classList.contains('collapsed') ? 'false' : 'true');
  append(header, html('b', { text: 'ENGINE' }), collapse);
  append(box, header, html('div', { id: 'ueFloatBody', className: 'ue-fbody' }));
  // Engine metrics live in the drawer's Performance section; the legacy
  // floating bottom-right box remains only as a fallback without the drawer.
  if (drawerHost) drawerHost.append(box);
  else document.body.append(box);
}

export function renderRuntimePanels(): void {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const method = integratorRegistry[snapshot.method];
  const drift = diag?.drift ?? 0;
  const claimSurface = currentClaimEvidenceSurface();
  const runtimeWarnings = [...warnings(snapshot, method), ...claimEvidenceWarnings(claimSurface)];
  const claimHeadline =
    claimSurface.loadState === 'loaded'
      ? `${claimSurface.counts.withheld} withheld · ${claimSurface.counts.informational} info · ${claimSurface.counts.measured} measured`
      : 'unavailable (fail-closed)';
  setMetric('siFps', diag?.fps ? diag.fps.toFixed(0) : '-');
  setMetric('siPhys', diag?.physicsMsPerFrame ? `${diag.physicsMsPerFrame.toFixed(2)} ms` : '-');
  setMetric('siDrift', Number.isFinite(drift) ? drift.toExponential(2) : '-');
  setMetric('siRecoveries', String(state.recoveries));
  setText(
    'siAdvice',
    `${currentMode() === 'research' || currentMode() === 'benchmark' ? 'Status: strict mode, auto-actions disabled.' : 'Status: runtime assist ready.'}`
  );
  setText('v10MethodCard', `${method.name} | order ${method.order} | symplectic: ${method.symplectic}`);
  setText('v10ConfidenceBadge', `${claimLevel(snapshot)} · evidence ${claimHeadline}`);
  const evidenceBadgeLevel: ResultBadgeLevel =
    claimSurface.loadState !== 'loaded' || claimSurface.counts.withheld > 0 || claimSurface.counts.informational > 0
      ? 'caveat'
      : claimSurface.counts.measured > 0
        ? 'finite-time-estimate'
        : claimSurface.counts['publication-ready'] > 0
          ? 'publication-ready'
          : 'validated';
  attachBadge('v10ConfidenceBadge', evidenceBadgeLevel, claimHeadline, {
    title: 'Canonical public-claim evidence',
    source: 'config/claim-registry.json + reports/evidence-summary.json',
    parameters: {
      load: claimSurface.loadState,
      withheld: claimSurface.counts.withheld,
      informational: claimSurface.counts.informational,
      measured: claimSurface.counts.measured,
      validated: claimSurface.counts.validated,
      publicationReady: claimSurface.counts['publication-ready']
    },
    uncertainty: `Evidence freshness is re-evaluated at runtime; expires ${claimSurface.evidenceExpiresAt ?? 'unknown'}.`,
    externalValidation: 'Effective visibility is computed by the canonical claim-registry downgrade rules.',
    reproduce: 'npm run claims:check && npm run evidence:summary',
    caveat: claimEvidenceWarnings(claimSurface).join(' ') || 'No claim downgrade is active.',
    artifact: 'reports/evidence-summary.json',
    hash: claimSurface.evidenceSourceCommit ?? ''
  });
  setText('v10WarningBox', runtimeWarnings.join('\n'));
  setText('rgv7ValidityLine', runtimeWarnings.join(' '));
  renderStats('riStatusGrid', [
    ['method', method.id],
    ['system', snapshot.systemType],
    ['mode', currentMode()],
    ['dt', snapshot.dt.toPrecision(3)],
    ['damping', snapshot.damping.toPrecision(3)],
    ['drift', Number.isFinite(drift) ? drift.toExponential(2) : '-']
  ]);
  renderStats('rgv7RuntimeGrid', [
    ['mode', currentMode()],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback'],
    ['state hash', snapshot.hash],
    ['poincare', String(diag?.poincarePoints ?? 0)]
  ]);
  renderStats('rgv8RuntimePanel', [
    ['schema', 'v10-ts'],
    ['privacy', 'local-only'],
    ['claim', claimLevel(snapshot)],
    ['commands', String(commandRegistry.list().length)],
    ...claimEvidenceRuntimeRows(claimSurface)
  ]);
  renderStats('sfv9Summary', [
    ['method', method.id],
    ['state finite', snapshot.state.every(Number.isFinite) ? 'yes' : 'no'],
    ['integrators', String(Object.keys(integratorRegistry).length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderPlx(snapshot, method);
  renderArchitecture();
  const active = document.querySelector('.tabpanel.active')?.id ?? '';
  if (active === 'tab-research') renderResearch();
  if (active === 'tab-canonical') renderCanonical();
  if (active === 'tab-aplus') renderAPlus();
  if (active === 'tab-validate') renderValidationResults();
  renderFloatingDiag(snapshot, diag);
}

export function setMetric(id: string, value: string): void {
  const node = $(id);
  const span = node?.querySelector('span');
  if (span) span.textContent = value;
}

export function renderStats(id: string, pairs: Array<[string, string]>): void {
  const box = $(id);
  clear(box);
  pairs.forEach(([k, v]) => box?.append(row(k, v)));
}

export function renderPlx(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): void {
  renderStats('plxPhysicsSummary', [
    ['system', snapshot.systemType],
    ['method', method.id],
    ['dt', String(snapshot.dt)],
    ['gamma', String(snapshot.damping)]
  ]);
  renderStats('plxRuntimeSummary', [
    ['mode', currentMode()],
    ['hash', snapshot.hash],
    ['commands', String(commandRegistry.list().length)],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback']
  ]);
  renderStats('plxMethodCaps', [
    ['order', String(method.order)],
    ['symplectic', method.symplectic],
    ['damping', method.dampingSupport]
  ]);
  const badges = $('plxBadges');
  clear(badges);
  ['strict-json', 'module-worker', 'typed-physics', 'legacy-parity'].forEach((text) =>
    badges?.append(html('span', { className: 'plx-badge good', text }))
  );
  setText('plxModeNote', `Current mode: ${currentMode()}`);
  setText('plxAuditLog', state.auditLog.join('\n') || 'no automatic mutations recorded');
  setText('plxErrorLog', state.lastFault);
}

export function renderArchitecture(): void {
  const nodes: Array<[string, string]> = [
    ['DOM Shell', 'core'],
    ['Command Bus', 'core'],
    ['State Store', 'core'],
    ['Typed Physics', 'core'],
    ['Workers', typeof Worker !== 'undefined' ? 'core' : 'warn'],
    ['Validation', 'core'],
    ['Export', 'core'],
    ['Parity Layer', 'core']
  ];
  const map = $('ueArchMap');
  clear(map);
  nodes.forEach(([label, cls]) => map?.append(html('span', { className: `ue-node ${cls}`, text: label })));
  renderStats('ueContracts', [
    ['StateStore', 'versioned snapshots + strict import'],
    ['Physics', 'typed RHS and integrators'],
    ['Validation', 'determinism, drift, canonical residual'],
    ['Export', 'manifest + limitation metadata']
  ]);
  renderStats('ueTasks', [
    ['render loop', 'requestAnimationFrame'],
    ['validation', 'on demand'],
    ['worker bridge', 'module fallback'],
    ['parity refresh', '1s']
  ]);
  renderStats('uePlugins', [
    ['feature parity', 'active'],
    ['analysis tabs', $('lyapSpecCanvas') ? 'active' : 'missing'],
    ['stable controls', $('stableIntuitivePanel') ? 'active' : 'missing']
  ]);
  renderStats('ueResources', [
    ['canvases', String(document.querySelectorAll('canvas').length)],
    ['commands', String(commandRegistry.list().length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderStats('ueStability', [
    ['finite state', currentSnapshot().state.every(Number.isFinite) ? 'yes' : 'no'],
    ['recovery count', String(state.recoveries)],
    ['last QA', state.lastCanonicalQa?.pass ? 'pass' : 'not run']
  ]);
  renderStats('ueFaults', [
    ['last fault', state.lastFault],
    ['fault panel', $('riErrorPanel') ? 'installed' : 'missing']
  ]);
  renderStats('ueCaps', [
    ['worker', typeof Worker !== 'undefined' ? 'yes' : 'no'],
    ['webgl2', capabilityText().includes('WebGL2=true') ? 'yes' : 'no'],
    ['audio', typeof AudioContext !== 'undefined' ? 'yes' : 'no']
  ]);
  renderStats('ueVerdict', [
    ['feature parity', featureDomOk() ? 'pass' : 'check'],
    ['legacy risk', 'inline handlers removed'],
    ['runtime', window.PendulumRuntime?.describe().version ?? 'modern']
  ]);
}

export function renderResearch(): void {
  const snapshot = currentSnapshot();
  const methodEntries = Object.values(integratorRegistry).map(
    (meta) => `${meta.id}: order ${meta.order}, ${meta.symplectic}`
  );
  setText('rgIntegrators', methodEntries.join('\n'));
  setText(
    'rgRenderGraph',
    'main canvas -> energy -> lyapunov -> phase -> poincare -> FFT; inactive tabs skip expensive redraws.'
  );
  setText(
    'rgPerf',
    `fps=${modernLab()?.diagnostics?.()?.fps.toFixed(1) ?? '-'} phys=${modernLab()?.diagnostics?.()?.physicsMsPerFrame.toFixed(2) ?? '-'} ms`
  );
  setText(
    'rgState',
    JSON.stringify(
      { system: snapshot.systemType, method: snapshot.method, hash: snapshot.hash, mode: snapshot.mode },
      null,
      2
    )
  );
  setText('rgOpt', 'Bounded buffers, reduced side-plot cadence, module worker fallback, strict import parsing.');
  setText('rgTests', LEGACY_VALIDATION_IDS.map((id) => `${id}: preserved/covered`).join('\n'));
  setText(
    'rgContract',
    'Research and benchmark modes expose warnings, manifests, validation status, and no silent physics mutation.'
  );
  renderResearchWorkbench();
  renderStats('rgQueue', [
    ['event bus', window.PendulumRuntime?.has('events') ? 'registered' : 'fallback'],
    ['commands', String(commandRegistry.list().length)],
    ['snapshot sync', 'available']
  ]);
}

export function renderCanonical(): void {
  const qa = state.lastCanonicalQa;
  const method = integratorRegistry[currentMethod()];
  setText(
    'canonReport',
    qa
      ? `QA ${qa.pass ? 'PASS' : 'CHECK'} residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}`
      : 'Canonical QA not run yet.'
  );
  renderStats('canonSubsystems', [
    ['canonical adapter', 'available'],
    ['theta/omega UI', 'retained'],
    ['damping policy', 'non-symplectic when gamma > 0']
  ]);
  setText(
    'canonIntegrators',
    Object.values(integratorRegistry)
      .map((meta) => `${meta.id}: ${meta.symplectic}`)
      .join('\n')
  );
  renderStats('canonAdaptive', [
    ['selected method', method.id],
    ['adaptive', method.order === 'adaptive' ? 'yes' : 'no'],
    ['tolerance', String(currentSnapshot().tolerance)]
  ]);
  renderStats('canonValidation', [
    ['runs', String(qa?.runs ?? 0)],
    ['last pass', String(qa?.pass ?? false)],
    ['residual', qa ? qa.residual.toExponential(3) : '-'],
    ['drift', qa ? qa.drift.toExponential(3) : '-']
  ]);
  setText('canonResidualStat', qa ? qa.residual.toExponential(2) : '-');
  setText('symplDefectStat', qa ? qa.symplecticDefect.toExponential(2) : '-');
  setText('rkfStat', currentMethod() === 'rkf45' ? 'adaptive active' : 'not active');
}

export function renderAPlus(): void {
  const audit = state.lastAudit;
  renderStats('aplusSummary', [
    ['audit status', audit ? (audit.failed ? 'check' : 'pass') : 'not run'],
    ['passed', String(audit?.passed ?? 0)],
    ['failed', String(audit?.failed ?? 0)]
  ]);
  renderStats('aplusNLink', [
    ['engine', 'rhsChain + energyChain'],
    ['coverage', 'double/triple equivalence tests'],
    ['current N', currentSystem() === 'triple' ? '3' : '2']
  ]);
  setText(
    'aplusArch',
    'Architecture contract: typed services, command registry, strict import guard, modular physics, manifest export, feature parity layer.'
  );
  setText(
    'aplusValidation',
    audit
      ? audit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n')
      : 'Run audit to populate results.'
  );
}

export function renderValidationResults(): void {
  const validation = state.lastValidation;
  const text = validation
    ? validation.map((item) => `${item.status} ${item.id}: ${item.measured}`).join('\n')
    : 'No validation run yet.';
  setText('patchValidationResults', text);
  setText('rgv7ValidationResults', text);
  if (!$('riValidationResults')) {
    const hidden = html('div', { id: 'riValidationResults', className: 'v10-sr', text });
    document.body.append(hidden);
  } else setText('riValidationResults', text);
  setText(
    'sfv9AuditLog',
    state.lastAudit
      ? state.lastAudit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n')
      : 'Audit not run yet.'
  );
}

export function renderFloatingDiag(
  snapshot: RuntimeSnapshot,
  diag: ReturnType<NonNullable<ModernLabHandle['diagnostics']>> | undefined
): void {
  const box = $('ueFloatBody');
  clear(box);
  box?.append(
    kvGrid('ueFloatStats', [
      ['method', snapshot.method],
      ['time', (diag?.time ?? snapshot.simTime).toFixed(2)],
      ['fps', diag?.fps ? diag.fps.toFixed(0) : '-'],
      ['drift', diag?.drift ? diag.drift.toExponential(2) : '-']
    ])
  );
}

export function claimLevel(snapshot: RuntimeSnapshot): string {
  if (!snapshot.state.every(Number.isFinite)) return 'invalid-after-fault';
  if (snapshot.systemType === 'triple') return 'experimental-triple';
  if (snapshot.systemType === 'compound-double')
    return snapshot.damping > 0 ? 'dissipative-compound-double' : 'validated-compound-double';
  if (snapshot.damping > 0) return 'dissipative';
  return 'validated-double';
}

export function warnings(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): string[] {
  const output: string[] = [];
  if (snapshot.damping > 0) output.push('gamma > 0: energy drift includes physical dissipation.');
  if (snapshot.systemType === 'triple') output.push('Triple mode remains experimental for research claims.');
  if (snapshot.systemType === 'compound-double')
    output.push('Uniform-rod model selected: point-mass equations and evidence do not apply to this run.');
  if (method.symplectic !== 'canonical-only' && method.symplectic !== 'no')
    output.push('Selected method is labelled approximate/pseudo-symplectic.');
  if (!output.length) output.push('No active scientific honesty warnings.');
  return output;
}
