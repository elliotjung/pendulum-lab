import { expect, test, type Page } from '@playwright/test';
import { openModernTab } from './shell';

const RESEARCH_KEY = 'pendulum-lab/research-workbench/v1';
const DESIGN_KEY = 'pendulum-lab/design-study/v1';
const CAPTION_KEY = 'pendulum-lab/figure-captions/v1';

interface WorkspaceProbeWindow extends Window {
  __workspaceImportProbe?: {
    armed: boolean;
    failCaptionOnce: boolean;
    researchWrites: string[];
  };
  __modernLab?: {
    runtimeSnapshot(): Record<string, unknown>;
    isRunning(): boolean;
    stop(): void;
  };
}

async function openWorkbench(page: Page): Promise<void> {
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');
}

async function chooseWorkspace(page: Page, payload: Record<string, unknown>): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#rwWorkspaceImportTop').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'pendulum_workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf8')
  });
  const preview = page.locator('.research-import-preview');
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Restore workspace', exact: true }).click();
}

test('Workspace restore rolls back every surface after a mid-apply failure, then commits on retry', async ({
  page
}) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
    window.localStorage.removeItem('pendulum-lab/design-study/v1');
    window.localStorage.removeItem('pendulum-lab/figure-captions/v1');
    void window.indexedDB?.deleteDatabase('pendulum-lab-research');
  });
  await openWorkbench(page);

  await page.evaluate((captionKey) => {
    window.localStorage.setItem(captionKey, JSON.stringify({ main: 'Original transaction caption' }));
  }, CAPTION_KEY);
  await page.locator('#rwExperimentName').fill('Original transaction experiment');
  await page.locator('#rwSaveExperiment').click();
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment');
  await page.evaluate(() => {
    const lab = (window as WorkspaceProbeWindow).__modernLab;
    if (!lab) throw new Error('Modern Lab unavailable');
    lab.stop();
  });

  const baselineSnapshot = await page.evaluate(() => {
    const lab = (window as WorkspaceProbeWindow).__modernLab;
    if (!lab) throw new Error('Modern Lab unavailable');
    return lab.runtimeSnapshot();
  });
  const importedSnapshot = {
    ...baselineSnapshot,
    schemaVersion: 'pendulum-session/v10-ts',
    systemType: 'double',
    method: 'rk4',
    mode: 'research',
    dt: 0.004,
    tolerance: 1e-7,
    stepsPerFrame: 4,
    damping: 0.02,
    parameters: { m1: 1.1, m2: 1.2, l1: 1.15, l2: 0.95, g: 9.81 },
    state: [0.6, -0.4, 0.05, -0.02],
    simTime: 0,
    seed: 7,
    hash: 'workspace-import-recomputes-this-hash'
  };
  const payload = {
    schemaVersion: 'pendulum-workspace/v1',
    savedAt: '2026-08-24T00:00:00.000Z',
    research: {
      schemaVersion: 'pendulum-research-workbench/v4',
      experiments: [
        {
          id: 'imported-transaction-experiment',
          name: 'Imported transaction experiment',
          createdAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
          notes: 'Atomic Workspace restore fixture',
          tags: ['atomic'],
          snapshot: importedSnapshot,
          metrics: {
            drift: null,
            lambdaMax: null,
            fps: null,
            physicsMsPerFrame: null,
            poincarePoints: 0,
            qualityScore: 100,
            validationStatus: 'not-run'
          }
        }
      ],
      selectedExperimentId: 'imported-transaction-experiment',
      runLog: [],
      comparisonRows: []
    },
    designStudy: {
      schemaVersion: 'pendulum-design-study/v1',
      id: 'imported-transaction-design',
      generatedAt: '2026-08-24T00:00:00.000Z',
      variables: [{ key: 'theta1', min: -1, max: 1 }],
      strategy: 'sobol',
      count: 1,
      replicates: 1,
      budget: { maxPoints: 4, maxTimeMs: 10_000, maxFailures: 2 },
      points: [{ id: 'imported-point', values: { theta1: 0.25 }, origin: 'design', replicate: 0 }],
      status: 'idle',
      message: 'Ready'
    },
    figureCaptions: { main: 'Imported transaction caption' },
    snapshot: importedSnapshot
  };

  await page.evaluate(
    ({ researchKey, captionKey }) => {
      const probeWindow = window as WorkspaceProbeWindow;
      const probe = { armed: true, failCaptionOnce: true, researchWrites: [] as string[] };
      probeWindow.__workspaceImportProbe = probe;
      const original = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        writable: true,
        value(this: Storage, key: string, value: string) {
          if (probe.armed && key === researchKey) probe.researchWrites.push(value);
          if (probe.armed && key === captionKey && probe.failCaptionOnce) {
            probe.failCaptionOnce = false;
            throw new DOMException('injected caption quota failure', 'QuotaExceededError');
          }
          return original.call(this, key, value);
        }
      });
    },
    { researchKey: RESEARCH_KEY, captionKey: CAPTION_KEY }
  );

  await chooseWorkspace(page, payload);
  await expect(page.locator('#toast')).toContainText('[WORKSPACE_IMPORT_ROLLED_BACK]');
  await expect(page.locator('#rwExperimentSelect')).toContainText('Original transaction experiment');

  const rollback = await page.evaluate(
    ({ researchKey, designKey, captionKey }) => {
      const probeWindow = window as WorkspaceProbeWindow;
      const lab = probeWindow.__modernLab;
      const probe = probeWindow.__workspaceImportProbe;
      if (!lab || !probe) throw new Error('Workspace test probe unavailable');
      return {
        currentSnapshot: lab.runtimeSnapshot(),
        running: lab.isRunning(),
        researchRaw: window.localStorage.getItem(researchKey),
        expectedResearchRaw: probe.researchWrites[0] ?? null,
        researchWriteCount: probe.researchWrites.length,
        designRaw: window.localStorage.getItem(designKey),
        captions: JSON.parse(window.localStorage.getItem(captionKey) ?? '{}') as Record<string, string>
      };
    },
    { researchKey: RESEARCH_KEY, designKey: DESIGN_KEY, captionKey: CAPTION_KEY }
  );
  expect(rollback.currentSnapshot).toEqual(baselineSnapshot);
  expect(rollback.running).toBe(false);
  expect(rollback.researchRaw).toBe(rollback.expectedResearchRaw);
  expect(rollback.researchWriteCount).toBeGreaterThanOrEqual(3);
  expect(rollback.designRaw).toBeNull();
  expect(rollback.captions).toEqual({ main: 'Original transaction caption' });

  await page.evaluate(() => {
    const probe = (window as WorkspaceProbeWindow).__workspaceImportProbe;
    if (probe) probe.armed = false;
  });
  await chooseWorkspace(page, payload);
  await expect(page.locator('#toast')).toContainText('[WORKSPACE_IMPORT_COMMITTED]');
  await expect(page.locator('#rwExperimentSelect')).toContainText('Imported transaction experiment');
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment');

  const committed = await page.evaluate(
    ({ researchKey, designKey, captionKey }) => ({
      research: JSON.parse(window.localStorage.getItem(researchKey) ?? '{}') as {
        experiments?: Array<{ id?: string }>;
      },
      design: JSON.parse(window.localStorage.getItem(designKey) ?? 'null') as { id?: string } | null,
      captions: JSON.parse(window.localStorage.getItem(captionKey) ?? '{}') as Record<string, string>,
      dt: (document.getElementById('dt') as HTMLInputElement | null)?.value,
      spf: (document.getElementById('spf') as HTMLInputElement | null)?.value
    }),
    { researchKey: RESEARCH_KEY, designKey: DESIGN_KEY, captionKey: CAPTION_KEY }
  );
  expect(committed.research.experiments?.map((entry) => entry.id)).toEqual(['imported-transaction-experiment']);
  expect(committed.design?.id).toBe('imported-transaction-design');
  expect(committed.captions).toEqual({ main: 'Imported transaction caption' });
  expect(committed.dt).toBe('0.004');
  expect(committed.spf).toBe('4');
});
