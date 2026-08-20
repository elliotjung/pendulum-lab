import { uiMessage } from './uiLocale';
import { StateStore } from '../state/StateStore';
import type { RuntimeSnapshot } from '../types/domain';

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
const UPDATE_REQUESTED_KEY = 'pendulum-lab/pwa-update-requested';
const UPDATE_RECOVERY_KEY = 'pendulum-lab/pwa-update-recovery/v1';

interface UpdateRecovery {
  schemaVersion: 'pendulum-pwa-update-recovery/v1';
  savedAt: string;
  snapshot: RuntimeSnapshot;
  wasRunning: boolean;
  focusId: string | null;
}

function isViteDevelopmentShell(): boolean {
  return Boolean(document.querySelector('script[type="module"][src*="/src/main.ts"]'));
}

/** Install/update/offline state with explicit freshness and cache diagnostics. */
export function installPwaLifecycle(showToast: Toast): void {
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

  window.addEventListener('offline', () => showToast(uiMessage('offline'), 4000));
  window.addEventListener('online', () => {
    showToast(uiMessage('online'), 3200);
    void updateEvidenceFreshness();
  });
  void updateEvidenceFreshness();

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
      updateRequested = window.sessionStorage.getItem(UPDATE_REQUESTED_KEY) === '1';
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
    document.body.matches('.audience-chooser-open,.command-palette-open,[data-modal-depth]') ||
    document.querySelector('[role="dialog"]:not([hidden]),[aria-modal="true"]:not([hidden])')
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
          window.sessionStorage.setItem(UPDATE_REQUESTED_KEY, '1');
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
  const recovery: UpdateRecovery = {
    schemaVersion: 'pendulum-pwa-update-recovery/v1',
    savedAt: new Date().toISOString(),
    snapshot: currentSnapshot(),
    wasRunning: lab?.isRunning?.() ?? false,
    focusId: active instanceof HTMLElement && active.id ? active.id : null
  };
  window.sessionStorage.setItem(UPDATE_RECOVERY_KEY, JSON.stringify(recovery));
}

/** Restore the exact live snapshot after a user-approved service-worker update. */
export function restorePwaUpdateRecovery(showToast: Toast): void {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(UPDATE_RECOVERY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const recovery = JSON.parse(raw) as Partial<UpdateRecovery>;
    if (recovery.schemaVersion !== 'pendulum-pwa-update-recovery/v1') throw new Error('unsupported recovery schema');
    const validation = StateStore.validate(recovery.snapshot);
    if (!validation.ok || !validation.value) throw new Error(validation.problems.join('; '));
    const lab = (
      window as Window & {
        __modernLab?: { restoreSnapshot(snapshot: RuntimeSnapshot): void; isRunning(): boolean };
      }
    ).__modernLab;
    if (!lab) return;
    lab.restoreSnapshot(validation.value);
    if (!recovery.wasRunning && lab.isRunning()) document.getElementById('pauseBtn')?.click();
    const focusId = typeof recovery.focusId === 'string' ? recovery.focusId : null;
    if (focusId) window.setTimeout(() => document.getElementById(focusId)?.focus({ preventScroll: true }), 0);
    window.sessionStorage.removeItem(UPDATE_RECOVERY_KEY);
    window.sessionStorage.removeItem(UPDATE_REQUESTED_KEY);
    showToast(
      document.documentElement.lang === 'ko'
        ? '업데이트를 적용하고 실행 상태를 복원했습니다.'
        : 'Update applied and your run state was restored.',
      4200
    );
  } catch (error) {
    console.warn('Pendulum Lab update recovery remains available for a later retry.', error);
    showToast(
      document.documentElement.lang === 'ko'
        ? '업데이트는 적용됐지만 실행 상태 복원에 실패했습니다. 복구 데이터는 유지됩니다.'
        : 'The update applied, but run-state recovery failed. Recovery data was retained.',
      5200
    );
  }
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
    setText(
      'dPwaEvidence',
      document.documentElement.lang === 'ko'
        ? `${expired ? '공식 근거 만료' : passed ? '검증 근거 유효' : '검증 상태 불완전'} · ${date} · ${source}`
        : `${expired ? 'official evidence expired' : passed ? 'evidence current' : 'validation incomplete'} · ${date} · ${source}`
    );
  } catch {
    document.documentElement.dataset.evidenceFreshness = 'unknown';
    setText('dPwaEvidence', document.documentElement.lang === 'ko' ? '온라인에서 확인 필요' : 'check online');
  }
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
