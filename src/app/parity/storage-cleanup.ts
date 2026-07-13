export interface ResearchStorageCleanupController {
  countOlderThan(cutoff: string): Promise<{ total: number }>;
  deleteOlderThan(cutoff: string): Promise<{ total: number }>;
  afterDelete(cutoff: string, total: number, days: number): void;
  refresh(): void;
  toast(message: string): void;
}

/** Deterministic cutoff helper kept pure for unit tests and audit logs. */
export function researchCleanupCutoff(days: number, nowMs: number = Date.now()): string {
  const safeDays = Number.isFinite(days) ? Math.min(3_650, Math.max(1, Math.floor(days))) : 90;
  return new Date(nowMs - safeDays * 86_400_000).toISOString();
}

function cleanupAgeDays(): number {
  const value = Number.parseInt(
    (document.getElementById('rwDbCleanupAge') as HTMLSelectElement | null)?.value ?? '90',
    10
  );
  return Number.isFinite(value) ? value : 90;
}

export function previewResearchDbCleanup(controller: ResearchStorageCleanupController): void {
  const output = document.getElementById('rwDbCleanupSummary');
  if (!output) return;
  output.textContent = 'Checking old records…';
  void (async () => {
    try {
      const days = cleanupAgeDays();
      const preview = await controller.countOlderThan(researchCleanupCutoff(days));
      output.textContent =
        preview.total === 0
          ? `No research records are older than ${days} days.`
          : `${preview.total} research record(s) older than ${days} days are eligible. Settings and recent work are protected.`;
    } catch (error) {
      output.textContent = `Cleanup preview unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  })();
}

export function cleanupResearchDbByAge(controller: ResearchStorageCleanupController): void {
  void (async () => {
    try {
      const days = cleanupAgeDays();
      const cutoff = researchCleanupCutoff(days);
      const preview = await controller.countOlderThan(cutoff);
      if (preview.total === 0) {
        controller.toast(`No research records older than ${days} days`);
        previewResearchDbCleanup(controller);
        return;
      }
      if (
        !window.confirm(
          `Delete ${preview.total} research record(s) last updated more than ${days} days ago? Recent records and settings will be kept.`
        )
      )
        return;
      const deleted = await controller.deleteOlderThan(cutoff);
      controller.afterDelete(cutoff, deleted.total, days);
      controller.toast(`Deleted ${deleted.total} old research record(s)`);
      controller.refresh();
      previewResearchDbCleanup(controller);
    } catch (error) {
      controller.toast(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}
