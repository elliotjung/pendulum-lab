import { uiMessage } from './uiLocale';
import type { RuntimeSnapshot } from '../types/domain';
import { clearRuntimeClaimEvidence, setRuntimeClaimEvidence } from '../research/claimEvidenceSurfaces';
import { hasActiveModalSurface } from './modalSurface';
import {
  clearStoredPwaUpdateRecovery,
  isBoundedRecoveryFocusId,
  PWA_UPDATE_RECOVERY_SCHEMA,
  PWA_UPDATE_RECOVERY_TTL_MS,
  PWA_UPDATE_REQUESTED_KEY,
  readStoredPwaUpdateRecovery,
  storePwaUpdateRecovery,
  type StoredUpdateRecovery,
  type UpdateRecoveryV2,
  type UpdateRecoveryValidation
} from './PwaUpdateRecovery';

export {
  PWA_UPDATE_RECOVERY_MAX_BYTES,
  PWA_UPDATE_RECOVERY_SCHEMA,
  PWA_UPDATE_RECOVERY_TTL_MS,
  serializePwaUpdateRecovery,
  validatePwaUpdateRecovery,
  type UpdateRecoveryV2,
  type UpdateRecoveryValidation
} from './PwaUpdateRecovery';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface CacheStatus {
  type: 'CACHE_STATUS';
  version: string;
  entries: number;
  totalBytes: number;
  quotaBytes: number;
  updatedAt: number;
}

type Toast = (message: string, timeout?: number) => void;

const UPDATE_DISMISSED_KEY = 'pendulum-lab/pwa-update-dismissed';

function isViteDevelopmentShell(): boolean {
  return Boolean(document.querySelector('script[type="module"][src*="/src/main.ts"]'));
}

/** Install/update/offline state with explicit freshness and cache diagnostics. */
export function installPwaLifecycle(showToast: Toast): void {
  // Evidence trust is independent of service-worker support. Load it before
  // any PWA-only early return so development, unsupported browsers, and the
  // installed app all use the same fail-closed claim evaluator.
  window.addEventListener('offline', () => showToast(uiMessage('offline'), 4000));
  window.addEventListener('online', () => {
    showToast(uiMessage('online'), 3200);
    void updateEvidenceFreshness();
  });
  void updateEvidenceFreshness();

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!window.isSecureContext && !loopback) return;
  // A production service worker must never cache Vite's source-module graph.
  // That can combine modules from different revisions and produce false HMR/
  // cold-start failures. Preview/E2E builds still exercise the real worker.
  if (isViteDevelopmentShell()) {
    setText('dPwaCache', document.documentElement.lang === 'ko' ? '개발 모드 캐시 우회' : 'development cache bypass');
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
    return;
  }

  const installButton = document.getElementById('pwaInstallButton');
  let installPrompt: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installButton?.removeAttribute('hidden');
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.setAttribute('hidden', '');
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton?.setAttribute('hidden', '');
  });

  const scope = new URL('./', location.href).pathname;
  let reloading = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    let updateRequested = false;
    try {
      updateRequested = window.sessionStorage.getItem(PWA_UPDATE_REQUESTED_KEY) === '1';
    } catch {
      updateRequested = false;
    }
    if (updateRequested && !reloading) {
      reloading = true;
      location.reload();
    } else {
      showToast(
        document.documentElement.lang === 'ko'
          ? '업데이트가 준비되었습니다. 다음 시작 때 적용됩니다.'
          : 'The update is ready and will apply on the next start.',
        4200
      );
    }
  });

  void navigator.serviceWorker
    .register(new URL('./sw.js', location.href), { scope })
    .then((registration) => {
      showUpdateWhenSafe(registration, showToast);
      void queryCacheStatus(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) showUpdateWhenSafe(registration, showToast);
            void queryCacheStatus(registration);
          }
        });
      });
    })
    .catch((error: unknown) => {
      console.warn('Pendulum Lab service worker registration failed; online mode remains available.', error);
      setText('dPwaCache', uiMessage('cacheStale'));
      showToast(uiMessage('offlineUnavailable'));
    });
}

function updatePromptMustWait(): boolean {
  const lab = (window as Window & { __modernLab?: { isRunning?(): boolean } }).__modernLab;
  if (!lab || lab.isRunning?.()) return true;
  if (
    hasActiveModalSurface() ||
    document.getElementById('onboardingTour') ||
    document.body.matches('.audience-chooser-open,.command-palette-open')
  )
    return true;
  const active = document.activeElement;
  return Boolean(
    active && active !== document.body && active.matches('input,select,textarea,[contenteditable="true"]')
  );
}

function showUpdateWhenSafe(registration: ServiceWorkerRegistration, showToast: Toast): void {
  if (!registration.waiting || document.getElementById('pwaUpdateBanner')) return;
  try {
    if (window.sessionStorage.getItem(UPDATE_DISMISSED_KEY) === '1') return;
  } catch {
    // Session storage is optional; the update prompt can still be used.
  }
  if (updatePromptMustWait()) {
    setText(
      'dPwaCache',
      document.documentElement.lang === 'ko' ? '업데이트 대기 · 일시정지 후 안내' : 'update waiting · pause to review'
    );
    window.setTimeout(() => showUpdateWhenSafe(registration, showToast), 1200);
    return;
  }
  showUpdate(registration, showToast);
}

function showUpdate(registration: ServiceWorkerRegistration, showToast: Toast): void {
  const korean = document.documentElement.lang === 'ko';
  const banner = document.createElement('div');
  banner.id = 'pwaUpdateBanner';
  banner.className = 'pwa-update-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', korean ? '앱 업데이트' : 'App update');
  const copy = document.createElement('span');
  copy.setAttribute('role', 'status');
  copy.textContent = korean ? '새 버전을 사용할 수 있습니다.' : 'A new version is ready.';
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = korean ? '저장 후 업데이트' : 'Save & update';
  update.addEventListener('click', () => {
    update.disabled = true;
    void persistUpdateRecovery()
      .then(() => {
        try {
          window.sessionStorage.setItem(PWA_UPDATE_REQUESTED_KEY, '1');
        } catch {
          // Controller activation still succeeds; only automatic reload is unavailable.
        }
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      })
      .catch(() => {
        update.disabled = false;
        showToast(
          korean
            ? '작업 복구 지점을 저장하지 못했습니다. 내보내기 후 다시 시도하세요.'
            : 'The recovery point could not be saved. Export your work, then try again.',
          5200
        );
      });
  });
  const notes = document.createElement('a');
  notes.href = './reports/release-readiness.json';
  notes.target = '_blank';
  notes.rel = 'noopener';
  notes.textContent = korean ? '릴리스 정보' : 'Release notes';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pwa-update-dismiss';
  dismiss.setAttribute('aria-label', korean ? '다음 시작 때 업데이트' : 'Update on next start');
  dismiss.title = korean ? '다음 시작 때 적용' : 'Apply on next start';
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => {
    try {
      window.sessionStorage.setItem(UPDATE_DISMISSED_KEY, '1');
    } catch {
      // Best-effort session preference.
    }
    banner.remove();
  });
  banner.append(copy, update, notes, dismiss);
  document.body.append(banner);
}

async function persistUpdateRecovery(): Promise<void> {
  const [{ currentSnapshot }, storage, design] = await Promise.all([
    import('./parity/shared'),
    import('./parity/storage-sync'),
    import('./parity/research-workbench-design-study')
  ]);
  // A controller takeover is destructive if either durable write is still
  // queued. Await both storage channels before authorizing SKIP_WAITING.
  await Promise.all([storage.flushResearchStateForUpdate(), design.flushDesignStudyForUpdate()]);
  const lab = (window as Window & { __modernLab?: { isRunning?(): boolean } }).__modernLab;
  const active = document.activeElement;
  const savedAtMs = Date.now();
  const candidateFocusId = active instanceof HTMLElement && active.id ? active.id : null;
  const recovery: UpdateRecoveryV2 = {
    schemaVersion: PWA_UPDATE_RECOVERY_SCHEMA,
    savedAt: new Date(savedAtMs).toISOString(),
    expiresAt: new Date(savedAtMs + PWA_UPDATE_RECOVERY_TTL_MS).toISOString(),
    snapshot: currentSnapshot(),
    wasRunning: lab?.isRunning?.() ?? false,
    focusId: isBoundedRecoveryFocusId(candidateFocusId) ? candidateFocusId : null,
    restorePolicy: 'paused-safe-mode'
  };
  storePwaUpdateRecovery(recovery);
}

function recoverySummary(validation: UpdateRecoveryValidation, korean: boolean): string {
  const size = `${validation.bytes.toLocaleString(korean ? 'ko-KR' : 'en-US')} B`;
  if (validation.status !== 'valid' && validation.status !== 'expired') {
    return korean
      ? `상태: ${validation.status}\n크기: ${size}\n이유: ${validation.reason}`
      : `Status: ${validation.status}\nSize: ${size}\nReason: ${validation.reason}`;
  }
  const recovery = validation.recovery;
  const saved = new Intl.DateTimeFormat(korean ? 'ko-KR' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(recovery.savedAt));
  const expiration = new Intl.DateTimeFormat(korean ? 'ko-KR' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(recovery.expiresAt));
  const lines = korean
    ? [
        `상태: ${validation.status}`,
        `저장: ${saved}`,
        `만료: ${expiration}`,
        `시스템/방법: ${recovery.snapshot.systemType} / ${recovery.snapshot.method}`,
        `시뮬레이션 시간: ${recovery.snapshot.simTime.toPrecision(6)} s`,
        `업데이트 전 실행 중: ${recovery.wasRunning ? '예' : '아니요'}`,
        `크기: ${size}`
      ]
    : [
        `Status: ${validation.status}`,
        `Saved: ${saved}`,
        `Expires: ${expiration}`,
        `System/method: ${recovery.snapshot.systemType} / ${recovery.snapshot.method}`,
        `Simulation time: ${recovery.snapshot.simTime.toPrecision(6)} s`,
        `Running before update: ${recovery.wasRunning ? 'yes' : 'no'}`,
        `Size: ${size}`
      ];
  if (validation.reason) lines.push(`${korean ? '이유' : 'Reason'}: ${validation.reason}`);
  return lines.join('\n');
}

function restoreFocusOnce(focusId: string | null): void {
  if (!isBoundedRecoveryFocusId(focusId) || focusId === null) return;
  window.setTimeout(() => {
    const target = document.getElementById(focusId);
    if (
      !(target instanceof HTMLElement) ||
      !target.isConnected ||
      target.hidden ||
      target.matches(':disabled,[aria-hidden="true"]') ||
      target.closest('[inert]')
    )
      return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      // Focus recovery is best-effort and attempted at most once.
    }
  }, 0);
}

function applySafeUpdateRecovery(recovery: UpdateRecoveryV2, banner: HTMLElement, showToast: Toast): void {
  const korean = document.documentElement.lang === 'ko';
  const lab = (
    window as Window & {
      __modernLab?: {
        restoreRecoverySnapshot(snapshot: RuntimeSnapshot): void;
        isRunning(): boolean;
        stop?(): void;
      };
    }
  ).__modernLab;
  if (!lab) {
    showToast(
      korean
        ? '시뮬레이터가 준비되지 않아 복구 데이터를 유지했습니다.'
        : 'The Lab is not ready; recovery data was retained.',
      5200
    );
    return;
  }
  try {
    if (lab.isRunning()) {
      document.getElementById('pauseBtn')?.click();
      if (lab.isRunning()) lab.stop?.();
    }
    lab.restoreRecoverySnapshot({ ...recovery.snapshot, mode: 'recovery' });
    if (lab.isRunning()) {
      document.getElementById('pauseBtn')?.click();
      if (lab.isRunning()) lab.stop?.();
    }
    if (lab.isRunning()) throw new Error('The restored simulation could not be paused.');
    if (!clearStoredPwaUpdateRecovery()) throw new Error('Recovery storage could not be cleared safely.');
    banner.remove();
    restoreFocusOnce(recovery.focusId);
    showToast(
      korean
        ? '복구 지점을 안전 모드로 적용했습니다. 시뮬레이션은 일시정지 상태입니다.'
        : 'Recovery was applied in safe mode. The simulation remains paused.',
      4800
    );
  } catch (error) {
    console.warn('Pendulum Lab update recovery remains available for inspection or a later retry.', error);
    showToast(
      korean
        ? '안전 복구에 실패했습니다. 검사와 재시도를 위해 복구 데이터는 유지됩니다.'
        : 'Safe recovery failed. Recovery data was retained for inspection or retry.',
      5200
    );
  }
}

function renderUpdateRecoverySurface(stored: StoredUpdateRecovery, showToast: Toast): void {
  if (document.getElementById('pwaRecoveryBanner')) return;
  const korean = document.documentElement.lang === 'ko';
  const { validation } = stored;
  const canRestore = validation.status === 'valid';
  const banner = document.createElement('section');
  banner.id = 'pwaRecoveryBanner';
  banner.className = 'pwa-update-banner pwa-recovery-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', korean ? '업데이트 복구 지점' : 'Update recovery point');

  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = canRestore
    ? korean
      ? '검증된 복구 지점이 있습니다. 안전 모드는 자동 재생하지 않습니다.'
      : 'A validated recovery point is available. Safe mode will not auto-play.'
    : korean
      ? '복구 지점은 적용되지 않았습니다. 요약을 확인하거나 삭제하세요.'
      : 'The recovery point was not applied. Review its summary or delete it.';

  const summaryId = 'pwaRecoverySummary';
  const view = document.createElement('button');
  view.type = 'button';
  view.textContent = korean ? '요약 보기' : 'View summary';
  view.setAttribute('aria-controls', summaryId);
  view.setAttribute('aria-expanded', 'false');
  const summary = document.createElement('pre');
  summary.id = summaryId;
  summary.className = 'pwa-recovery-summary';
  summary.hidden = true;
  summary.textContent = recoverySummary(validation, korean);
  view.addEventListener('click', () => {
    summary.hidden = !summary.hidden;
    view.setAttribute('aria-expanded', String(!summary.hidden));
    view.textContent = summary.hidden ? (korean ? '요약 보기' : 'View summary') : korean ? '요약 닫기' : 'Hide summary';
  });

  banner.append(status, view);
  if (canRestore) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = korean ? '일시정지로 복구' : 'Restore paused';
    restore.addEventListener('click', () => applySafeUpdateRecovery(validation.recovery, banner, showToast));
    banner.append(restore);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = korean ? '복구 데이터 삭제' : 'Delete recovery';
  remove.addEventListener('click', () => {
    if (!clearStoredPwaUpdateRecovery()) {
      showToast(korean ? '복구 데이터를 삭제하지 못했습니다.' : 'Recovery data could not be deleted.', 4200);
      return;
    }
    banner.remove();
    showToast(korean ? '복구 데이터를 삭제했습니다.' : 'Recovery data was deleted.', 3200);
  });
  banner.append(remove, summary);
  document.body.append(banner);
}

/** Offer a validated, paused safe-mode recovery after an approved update. */
export function restorePwaUpdateRecovery(showToast: Toast): void {
  const stored = readStoredPwaUpdateRecovery();
  if (!stored) return;
  renderUpdateRecoverySurface(stored, showToast);
}

async function queryCacheStatus(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = navigator.serviceWorker.controller ?? registration.active;
  if (!worker || typeof MessageChannel === 'undefined') {
    setText('dPwaCache', registration.installing ? 'installing' : uiMessage('cacheStale'));
    return;
  }
  const channel = new MessageChannel();
  const response = new Promise<CacheStatus | null>((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 2500);
    channel.port1.onmessage = (event: MessageEvent<CacheStatus>) => {
      window.clearTimeout(timeout);
      resolve(event.data?.type === 'CACHE_STATUS' ? event.data : null);
    };
  });
  worker.postMessage({ type: 'CACHE_STATUS_REQUEST' }, [channel.port2]);
  const status = await response;
  channel.port1.close();
  if (!status) {
    setText('dPwaCache', uiMessage('cacheStale'));
    return;
  }
  const usedMiB = status.totalBytes / (1024 * 1024);
  const quotaMiB = status.quotaBytes / (1024 * 1024);
  setText(
    'dPwaCache',
    `${uiMessage('cacheReady')} · ${status.entries} · ${usedMiB.toFixed(1)}/${quotaMiB.toFixed(0)} MiB`
  );
}

async function updateEvidenceFreshness(): Promise<void> {
  try {
    const response = await fetch(new URL('./reports/evidence-summary.json', location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const report = (await response.json()) as {
      generatedAt?: unknown;
      provenance?: { expiresAt?: unknown; sourceCommit?: unknown };
      tests?: { success?: unknown };
    };
    const claimSurface = setRuntimeClaimEvidence(report);
    if (claimSurface.loadState !== 'loaded') throw new Error('canonical claim evidence unavailable');
    const generatedAt = typeof report.generatedAt === 'string' ? Date.parse(report.generatedAt) : Number.NaN;
    const expiresAt =
      typeof report.provenance?.expiresAt === 'string' ? Date.parse(report.provenance.expiresAt) : Number.NaN;
    if (!Number.isFinite(generatedAt) || !Number.isFinite(expiresAt)) throw new Error('missing evidence dates');
    const expired = Date.now() > expiresAt;
    document.documentElement.dataset.evidenceFreshness = expired ? 'expired' : 'current';
    const date = new Intl.DateTimeFormat(document.documentElement.lang === 'ko' ? 'ko-KR' : 'en', {
      dateStyle: 'medium'
    }).format(expiresAt);
    const source =
      typeof report.provenance?.sourceCommit === 'string' ? report.provenance.sourceCommit.slice(0, 12) : 'unknown';
    const passed = report.tests?.success === true;
    const claimDetail =
      document.documentElement.lang === 'ko'
        ? `검증됨 ${claimSurface.counts.validated} · 측정됨 ${claimSurface.counts.measured} · 정보용 ${claimSurface.counts.informational} · 보류 ${claimSurface.counts.withheld}`
        : `${claimSurface.counts.validated} validated · ${claimSurface.counts.measured} measured · ${claimSurface.counts.informational} informational · ${claimSurface.counts.withheld} withheld`;
    document.documentElement.dataset.claimEvidence = claimSurface.loadState;
    setText(
      'dPwaEvidence',
      document.documentElement.lang === 'ko'
        ? `${expired ? '공식 근거 만료' : passed ? '검증 근거 유효' : '검증 상태 불완전'} · ${claimDetail} · ${date} · ${source}`
        : `${expired ? 'official evidence expired' : passed ? 'evidence current' : 'validation incomplete'} · ${claimDetail} · ${date} · ${source}`
    );
  } catch {
    clearRuntimeClaimEvidence();
    document.documentElement.dataset.evidenceFreshness = 'unknown';
    document.documentElement.dataset.claimEvidence = 'unavailable';
    setText('dPwaEvidence', document.documentElement.lang === 'ko' ? '온라인에서 확인 필요' : 'check online');
  }
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
