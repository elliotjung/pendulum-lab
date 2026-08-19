import { uiMessage } from './uiLocale';

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

/** Install/update/offline state with explicit freshness and cache diagnostics. */
export function installPwaLifecycle(showToast: Toast): void {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!window.isSecureContext && !loopback) return;

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
    if (!reloading) {
      reloading = true;
      location.reload();
    }
  });

  void navigator.serviceWorker
    .register(new URL('./sw.js', location.href), { scope })
    .then((registration) => {
      showUpdate(registration);
      void queryCacheStatus(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) showUpdate(registration);
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

function showUpdate(registration: ServiceWorkerRegistration): void {
  if (!registration.waiting || document.getElementById('pwaUpdateBanner')) return;
  const korean = document.documentElement.lang === 'ko';
  const banner = document.createElement('div');
  banner.id = 'pwaUpdateBanner';
  banner.className = 'pwa-update-banner';
  banner.setAttribute('role', 'status');
  const copy = document.createElement('span');
  copy.textContent = korean ? '새 버전을 사용할 수 있습니다.' : 'A new version is ready.';
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = korean ? '지금 업데이트' : 'Update now';
  update.addEventListener('click', () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }));
  const notes = document.createElement('a');
  notes.href = './reports/release-readiness.json';
  notes.target = '_blank';
  notes.rel = 'noopener';
  notes.textContent = korean ? '릴리스 정보' : 'Release notes';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pwa-update-dismiss';
  dismiss.setAttribute('aria-label', korean ? '업데이트 알림 닫기' : 'Dismiss update');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => banner.remove());
  banner.append(copy, update, notes, dismiss);
  document.body.append(banner);
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
    const response = await fetch(new URL('./reports/release-readiness.json', location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const report = (await response.json()) as { generatedAt?: unknown; status?: unknown };
    const generatedAt = typeof report.generatedAt === 'string' ? Date.parse(report.generatedAt) : Number.NaN;
    if (!Number.isFinite(generatedAt)) throw new Error('missing generatedAt');
    const ageDays = Math.max(0, (Date.now() - generatedAt) / 86_400_000);
    const date = new Intl.DateTimeFormat(document.documentElement.lang === 'ko' ? 'ko-KR' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(generatedAt);
    const stale = ageDays > 30;
    setText(
      'dPwaEvidence',
      document.documentElement.lang === 'ko'
        ? `${date} 생성 · ${stale ? '30일 초과' : String(report.status ?? '상태 미상')}`
        : `generated ${date} · ${stale ? 'older than 30 days' : String(report.status ?? 'status unknown')}`
    );
  } catch {
    setText('dPwaEvidence', document.documentElement.lang === 'ko' ? '온라인에서 확인 필요' : 'check online');
  }
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
