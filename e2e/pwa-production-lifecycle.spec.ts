import { expect, test, type Page } from '@playwright/test';
import { openModernTab } from './shell';

const RECOVERY_KEY = 'pendulum-lab/pwa-update-recovery/v2';
const RESEARCH_KEY = 'pendulum-lab/research-workbench/v1';
const DESIGN_KEY = 'pendulum-lab/design-study/v1';
const RESEARCH_DB_NAME = 'pendulum-lab-research';
const RESEARCH_MARKER = 'PWA update durability experiment';
const RESEARCH_NOTES = 'Must survive an explicitly approved production worker takeover.';

interface RuntimeSnapshotView {
  schemaVersion: string;
  systemType: string;
  method: string;
  state: number[];
  simTime: number;
  hash: string;
}

interface ModernLabView {
  isRunning(): boolean;
  runtimeSnapshot(): RuntimeSnapshotView;
}

interface PersistenceView {
  research: {
    schemaVersion?: string;
    selectedExperimentId?: string;
    experiments?: Array<{
      id?: string;
      name?: string;
      notes?: string;
      tags?: string[];
      snapshot?: RuntimeSnapshotView;
    }>;
  } | null;
  design: {
    schemaVersion?: string;
    id?: string;
    strategy?: string;
    count?: number;
    variables?: Array<{ key?: string; min?: number; max?: number }>;
    points?: Array<{ id?: string; values?: Record<string, number> }>;
  } | null;
}

interface DurablePersistenceView extends PersistenceView {
  indexedDb: {
    experiment: unknown;
    design: unknown;
  };
}

async function waitForModernLab(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __modernLab?: Partial<ModernLabView> }).__modernLab?.isRunning &&
      (window as unknown as { __modernLab?: Partial<ModernLabView> }).__modernLab?.runtimeSnapshot
    )
  );
}

async function waitForServiceWorkerControl(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('service worker did not claim the page')), 10_000);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
    }
    const worker = navigator.serviceWorker.controller ?? registration.active;
    if (!worker) throw new Error('service worker registration has no controlling worker');
    return worker.scriptURL;
  });
}

async function waitForDocumentAssetsInPwaCache(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const urls = [
            ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (node) => node.src),
            ...Array.from(
              document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
              (node) => node.href
            )
          ].filter((url) => new URL(url).origin === location.origin);
          if (urls.length === 0) return ['no production document assets found'];
          const responses = await Promise.all(urls.map((url) => caches.match(url)));
          return urls.filter((_url, index) => !responses[index]);
        }),
      { timeout: 15_000, message: 'production scripts and styles should be present in the PWA caches' }
    )
    .toEqual([]);
}

async function readLocalPersistence(page: Page): Promise<PersistenceView> {
  return page.evaluate(
    ({ researchKey, designKey }) => {
      const parse = (key: string): unknown => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      };
      return {
        research: parse(researchKey),
        design: parse(designKey)
      } as PersistenceView;
    },
    { researchKey: RESEARCH_KEY, designKey: DESIGN_KEY }
  );
}

async function readDurablePersistence(
  page: Page,
  experimentId: string,
  designId: string
): Promise<DurablePersistenceView> {
  return page.evaluate(
    async ({ researchKey, designKey, databaseName, expectedExperimentId, expectedDesignId }) => {
      const parse = (key: string): unknown => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('research database open failed'));
        request.onblocked = () => reject(new Error('research database open was blocked'));
      });
      try {
        const transaction = database.transaction(['experiments', 'parameterStudies'], 'readonly');
        const transactionDone = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error ?? new Error('research database read aborted'));
          transaction.onerror = () => reject(transaction.error ?? new Error('research database read failed'));
        });
        const record = (store: string, id: string): Promise<{ payload?: unknown } | undefined> =>
          new Promise((resolve, reject) => {
            const request = transaction.objectStore(store).get(id);
            request.onsuccess = () => resolve(request.result as { payload?: unknown } | undefined);
            request.onerror = () => reject(request.error ?? new Error(`${store} read failed`));
          });
        const [experiment, design] = await Promise.all([
          record('experiments', expectedExperimentId),
          record('parameterStudies', `design:${expectedDesignId}`)
        ]);
        await transactionDone;
        return {
          research: parse(researchKey),
          design: parse(designKey),
          indexedDb: { experiment: experiment?.payload ?? null, design: design?.payload ?? null }
        } as DurablePersistenceView;
      } finally {
        database.close();
      }
    },
    {
      researchKey: RESEARCH_KEY,
      designKey: DESIGN_KEY,
      databaseName: RESEARCH_DB_NAME,
      expectedExperimentId: experimentId,
      expectedDesignId: designId
    }
  );
}

test('built worker defers a live update, durably saves research, and restores the exact paused runtime', async ({
  context,
  page
}) => {
  await page.goto('/app.html?audience=student', { waitUntil: 'domcontentloaded' });
  await waitForModernLab(page);
  expect(await waitForServiceWorkerControl(page)).toMatch(/\/sw\.js(?:\?|$)/u);

  // Perform a regular controlled navigation so the exact production JS/CSS
  // graph is stored by the real worker. A browser reload deliberately carries
  // `cache: reload`, which this worker correctly treats as an explicit bypass.
  await page.goto('/app.html?audience=student&pwa-warm=1', { waitUntil: 'domcontentloaded' });
  await waitForModernLab(page);
  await waitForServiceWorkerControl(page);
  await waitForDocumentAssetsInPwaCache(page);

  await context.setOffline(true);
  await page.goto('/?audience=student&tab=lab&pwa-offline=1', { waitUntil: 'domcontentloaded' });
  await waitForModernLab(page);
  await expect(page.getByRole('heading', { name: /Pendulum Lab/i })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('pwa-offline')).toBe('1');
  expect(await waitForServiceWorkerControl(page)).toMatch(/\/sw\.js(?:\?|$)/u);
  await context.setOffline(false);

  // Mount research online so its lazy production chunk is available before
  // seeding durable work; the preceding offline leg intentionally exercises
  // only the already-cached student shell.
  await page.goto('/app.html?audience=research&tab=lab&pwa-research=1', { waitUntil: 'domcontentloaded' });
  await waitForModernLab(page);
  await waitForServiceWorkerControl(page);
  await openModernTab(page, 'research', '#researchWorkbench');
  await page.locator('#rwExperimentName').fill(RESEARCH_MARKER);
  await page.locator('#rwExperimentNotes').fill(RESEARCH_NOTES);
  await page.locator('#rwExperimentTags').fill('pwa, durability');
  await page.locator('#rwSaveExperiment').click();
  await expect(page.locator('#rwExperimentSummary')).toContainText(RESEARCH_MARKER);

  await page.locator('#rwDesignVars').fill('theta1,-0.4,0.4\ndamping,0.01,0.04');
  await page.locator('#rwDesignStrategy').selectOption('sobol');
  await page.locator('#rwDesignCount').fill('3');
  await page.locator('#rwGenerateDesign').click();
  await expect(page.locator('#rwDesignSummary')).toContainText('3 points');
  const expectedPersistence = await readLocalPersistence(page);
  const expectedExperiment = expectedPersistence.research?.experiments?.find(
    (experiment) => experiment.name === RESEARCH_MARKER
  );
  const expectedDesign = expectedPersistence.design;
  expect(expectedPersistence.research?.schemaVersion).toBe('pendulum-research-workbench/v4');
  expect(expectedExperiment).toMatchObject({
    name: RESEARCH_MARKER,
    notes: RESEARCH_NOTES,
    tags: ['pwa', 'durability']
  });
  expect(expectedDesign).toMatchObject({
    schemaVersion: 'pendulum-design-study/v1',
    strategy: 'sobol',
    count: 3,
    variables: [
      { key: 'theta1', min: -0.4, max: 0.4 },
      { key: 'damping', min: 0.01, max: 0.04 }
    ]
  });
  expect(expectedExperiment?.id).toBeTruthy();
  expect(expectedDesign?.id).toBeTruthy();

  await openModernTab(page, 'lab', '#tab-lab');
  const pause = page.locator('#pauseBtn');
  if (!(await page.evaluate(() => (window as unknown as { __modernLab: ModernLabView }).__modernLab.isRunning()))) {
    await pause.click();
  }
  await page.waitForFunction(() => (window as unknown as { __modernLab: ModernLabView }).__modernLab.isRunning());

  const controllerBefore = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
  const liveTimeBefore = await page.evaluate(
    () => (window as unknown as { __modernLab: ModernLabView }).__modernLab.runtimeSnapshot().simTime
  );
  const documentToken = 'pwa-live-document-must-not-reload';
  await page.evaluate((token) => {
    document.documentElement.dataset.pwaLifecycleDocument = token;
  }, documentToken);
  let documentLoads = 0;
  const countDocumentLoad = (): void => {
    documentLoads += 1;
  };
  page.on('domcontentloaded', countDocumentLoad);

  const waiting = await page.evaluate(async () => {
    const scope = new URL('./', location.href).pathname;
    const updateUrl = new URL('./sw.js', location.href);
    updateUrl.searchParams.set('playwright-update', 'a056-live-durability');
    const registration = await navigator.serviceWorker.register(updateUrl, { scope });
    const candidate = registration.waiting ?? registration.installing;
    if (!candidate) throw new Error('the production registration did not begin an update');
    if (candidate.state !== 'installed') {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('updated worker did not reach installed')), 15_000);
        const onStateChange = (): void => {
          if (candidate.state === 'installed') {
            window.clearTimeout(timeout);
            candidate.removeEventListener('statechange', onStateChange);
            resolve();
          } else if (candidate.state === 'redundant' || candidate.state === 'activated') {
            window.clearTimeout(timeout);
            candidate.removeEventListener('statechange', onStateChange);
            reject(new Error(`updated worker reached ${candidate.state} without waiting`));
          }
        };
        candidate.addEventListener('statechange', onStateChange);
      });
    }
    const waitingWorker = registration.waiting;
    if (!waitingWorker) throw new Error('updated production worker is not waiting');
    return { scriptURL: waitingWorker.scriptURL, state: waitingWorker.state };
  });
  expect(waiting).toMatchObject({ state: 'installed' });
  expect(waiting.scriptURL).toContain('playwright-update=');

  const updateBanner = page.locator('#pwaUpdateBanner');
  await page.waitForTimeout(1_800);
  const deferred = await page.evaluate(() => ({
    controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    documentToken: document.documentElement.dataset.pwaLifecycleDocument ?? null,
    running: (window as unknown as { __modernLab: ModernLabView }).__modernLab.isRunning(),
    simTime: (window as unknown as { __modernLab: ModernLabView }).__modernLab.runtimeSnapshot().simTime
  }));
  expect(documentLoads).toBe(0);
  expect(deferred).toMatchObject({
    controller: controllerBefore,
    documentToken,
    running: true
  });
  expect(deferred.simTime).toBeGreaterThan(liveTimeBefore);
  await expect(updateBanner).toHaveCount(0);

  await pause.click();
  await page.waitForFunction(() => !(window as unknown as { __modernLab: ModernLabView }).__modernLab.isRunning());
  await expect(updateBanner).toBeVisible();
  await expect(updateBanner.getByRole('button', { name: 'Save & update' })).toBeEnabled();
  expect(documentLoads).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(controllerBefore);
  const expected = await page.evaluate(() =>
    (window as unknown as { __modernLab: ModernLabView }).__modernLab.runtimeSnapshot()
  );
  expect(expected.simTime).toBeGreaterThan(liveTimeBefore);

  const reloaded = page.waitForEvent('domcontentloaded');
  await updateBanner.getByRole('button', { name: 'Save & update' }).click();
  await reloaded;
  page.off('domcontentloaded', countDocumentLoad);
  await waitForModernLab(page);

  const recoveryBanner = page.locator('#pwaRecoveryBanner');
  await expect(recoveryBanner).toBeVisible();
  await expect(recoveryBanner).toContainText('validated recovery point');
  const stored = await page.evaluate((key) => {
    const raw = sessionStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as { schemaVersion: string; restorePolicy: string; snapshot: RuntimeSnapshotView })
      : null;
  }, RECOVERY_KEY);
  expect(stored).not.toBeNull();
  expect(stored).toMatchObject({
    schemaVersion: 'pendulum-pwa-update-recovery/v2',
    restorePolicy: 'paused-safe-mode',
    snapshot: {
      schemaVersion: expected.schemaVersion,
      systemType: expected.systemType,
      method: expected.method,
      state: expected.state,
      simTime: expected.simTime,
      hash: expected.hash
    }
  });

  const durable = await readDurablePersistence(page, expectedExperiment!.id!, expectedDesign!.id!);
  const persistedExperiment = durable.research?.experiments?.find(
    (experiment) => experiment.id === expectedExperiment!.id
  );
  expect(durable.research?.selectedExperimentId).toBe(expectedPersistence.research?.selectedExperimentId);
  expect(persistedExperiment).toEqual(expectedExperiment);
  expect(durable.design).toEqual(expectedDesign);
  expect(durable.indexedDb.experiment).toEqual(expectedExperiment);
  expect(durable.indexedDb.design).toEqual(expectedDesign);

  await recoveryBanner.getByRole('button', { name: 'Restore paused' }).click();
  await expect(recoveryBanner).toBeHidden();
  const restored = await page.evaluate(
    (key) => ({
      snapshot: (window as unknown as { __modernLab: ModernLabView }).__modernLab.runtimeSnapshot(),
      running: (window as unknown as { __modernLab: ModernLabView }).__modernLab.isRunning(),
      recovery: sessionStorage.getItem(key)
    }),
    RECOVERY_KEY
  );
  expect(restored.running).toBe(false);
  expect(restored.recovery).toBeNull();
  expect(restored.snapshot).toMatchObject({
    systemType: expected.systemType,
    method: expected.method,
    state: expected.state,
    simTime: expected.simTime,
    hash: expected.hash
  });
});
