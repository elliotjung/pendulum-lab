import { commitLabControls } from '../app/controlCommit';
import { stateStore } from '../state/StateStore';
import type { StateStore } from '../state/StateStore';
import type { ImportValidationResult, RuntimeSnapshot } from '../types/domain';
import { MAX_JSON_BYTES, parseStrictJsonImport } from '../validation/importSchema';
import { validateLabSnapshot } from '../validation/sessionConstraints';

type SavedRunStore = Pick<StateStore, 'applyPatch'>;

/** Parse with the hardened schema guard, then mutate state only after success. */
export function parseAndApplySavedRun(
  text: string,
  store: SavedRunStore = stateStore
): ImportValidationResult<RuntimeSnapshot> {
  const parsed = parseStrictJsonImport(text);
  if (!parsed.ok || !parsed.value) return parsed;
  const labValidation = validateLabSnapshot(parsed.value);
  if (!labValidation.ok || !labValidation.value) return labValidation;
  try {
    return { ok: true, problems: [], value: store.applyPatch(labValidation.value) };
  } catch (error) {
    return {
      ok: false,
      problems: [`could not apply imported state: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/** Stable mapping shared by the browser importer and its headless tests. */
export function snapshotControlValues(snapshot: RuntimeSnapshot): Array<readonly [string, string | number]> {
  const method = snapshot.method === 'verlet' ? 'leapfrog' : snapshot.method;
  const toleranceExponent = snapshot.tolerance > 0 ? Math.log10(snapshot.tolerance) : -7;
  const values: Array<readonly [string, string | number]> = [
    ['sysType', snapshot.systemType],
    ['method', method],
    ['dt', snapshot.dt],
    ['tol', toleranceExponent],
    ['spf', snapshot.stepsPerFrame],
    ['gamma', snapshot.damping],
    ['seed', snapshot.seed ?? ''],
    ['m1', snapshot.parameters.m1],
    ['m2', snapshot.parameters.m2],
    ['l1', snapshot.parameters.l1],
    ['l2', snapshot.parameters.l2],
    ['g', snapshot.parameters.g],
    ['th1', snapshot.state[0] ?? 0],
    ['th2', snapshot.state[1] ?? 0]
  ];
  if (snapshot.systemType === 'triple') {
    values.push(
      ['m3', snapshot.parameters.m3 ?? 1],
      ['l3', snapshot.parameters.l3 ?? 1],
      ['th3', snapshot.state[2] ?? 0],
      ['iw1', snapshot.state[3] ?? 0],
      ['iw2', snapshot.state[4] ?? 0],
      ['iw3', snapshot.state[5] ?? 0]
    );
  } else {
    values.push(['iw1', snapshot.state[2] ?? 0], ['iw2', snapshot.state[3] ?? 0]);
  }
  return values;
}

interface PlannedControlWrite {
  element: HTMLInputElement | HTMLSelectElement;
  id: string;
  value: string;
  numericValue: number | null;
}

function planSnapshotControls(snapshot: RuntimeSnapshot): ImportValidationResult<PlannedControlWrite[]> {
  const planned: PlannedControlWrite[] = [];
  const problems: string[] = [];
  for (const [id, value] of snapshotControlValues(snapshot)) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      problems.push(`required Lab control #${id} is missing`);
      continue;
    }
    const next = String(value);
    if (element instanceof HTMLSelectElement) {
      if (!Array.from(element.options).some((option) => option.value === next)) {
        problems.push(`Lab control #${id} has no option for ${next}`);
        continue;
      }
      planned.push({ element, id, value: next, numericValue: null });
      continue;
    }
    const numericValue = typeof value === 'number' ? value : null;
    if (numericValue !== null && (element.type === 'range' || element.type === 'number')) {
      const min = element.min === '' ? Number.NEGATIVE_INFINITY : Number(element.min);
      const max = element.max === '' ? Number.POSITIVE_INFINITY : Number(element.max);
      if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) {
        problems.push(`Lab control #${id} cannot represent ${numericValue} within [${min}, ${max}]`);
        continue;
      }
    }
    planned.push({ element, id, value: next, numericValue });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, problems: [], value: planned };
}

/**
 * Apply a validated snapshot atomically to the real controls. Range controls
 * are a display projection: browsers snap arbitrary scientific values to the
 * control's configured step, while the commit event below carries the exact
 * snapshot to LabApp. Missing select options, clamping, and invalid numeric
 * readback still fail atomically.
 */
export function applySnapshotControls(snapshot: RuntimeSnapshot): ImportValidationResult<string[]> {
  const plan = planSnapshotControls(snapshot);
  if (!plan.ok || !plan.value) return { ok: false, problems: plan.problems };
  const previous = plan.value.map(({ element }) => element.value);
  const rollback = (): void => {
    plan.value!.forEach(({ element }, index) => {
      element.value = previous[index] ?? '';
    });
  };
  const applied: string[] = [];
  for (const { element, id, value, numericValue } of plan.value) {
    element.value = value;
    const isRangeProjection = element instanceof HTMLInputElement && element.type === 'range';
    const readBackMatches =
      numericValue === null
        ? element.value === value
        : element instanceof HTMLInputElement &&
          Number.isFinite(element.valueAsNumber) &&
          (isRangeProjection || element.valueAsNumber === numericValue);
    if (!readBackMatches) {
      rollback();
      return { ok: false, problems: [`Lab control #${id} changed ${value} to ${element.value}`] };
    }
    applied.push(id);
  }
  for (const { element } of plan.value) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  commitLabControls('saved-run-import', applied, snapshot);
  return { ok: true, problems: [], value: applied };
}

function notify(message: string, timeout = 3000): void {
  if (typeof window.toast === 'function') {
    window.toast(message, timeout);
    return;
  }
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  window.setTimeout(() => box.classList.remove('show'), timeout);
}

/** Wire the saved-run file input and its button through strict import + StateStore. */
export function installSavedRunImport(inputId = 'jsonFile', buttonId = 'loadJsonBtn'): void {
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement) || input.dataset.savedRunImportBound === 'true') return;
  input.dataset.savedRunImportBound = 'true';
  const button = document.getElementById(buttonId);

  button?.addEventListener('click', () => {
    // Clearing first lets choosing the same file again emit `change`.
    input.value = '';
    input.click();
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_JSON_BYTES) {
      notify('Import rejected: JSON file is too large');
      input.value = '';
      return;
    }

    input.disabled = true;
    if (button instanceof HTMLButtonElement) button.disabled = true;
    try {
      const parsed = parseStrictJsonImport(await file.text());
      if (!parsed.ok || !parsed.value) {
        notify(`Import rejected: ${parsed.problems.slice(0, 3).join('; ')}`, 4200);
        return;
      }
      const labValidation = validateLabSnapshot(parsed.value);
      if (!labValidation.ok || !labValidation.value) {
        notify(`Import rejected: ${labValidation.problems.slice(0, 3).join('; ')}`, 4200);
        return;
      }
      const controlPlan = planSnapshotControls(labValidation.value);
      if (!controlPlan.ok) {
        notify(`Import rejected: ${controlPlan.problems.slice(0, 3).join('; ')}`, 4200);
        return;
      }
      const previous = stateStore.snapshot();
      const appliedSnapshot = stateStore.applyPatch(labValidation.value);
      const controls = applySnapshotControls(appliedSnapshot);
      if (!controls.ok) {
        stateStore.applyPatch(previous);
        notify(`Import rejected: ${controls.problems.slice(0, 3).join('; ')}`, 4200);
        return;
      }
      notify(`Saved state from t=${appliedSnapshot.simTime.toFixed(3)} s loaded`);
    } catch (error) {
      notify(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 4200);
    } finally {
      input.disabled = false;
      if (button instanceof HTMLButtonElement) button.disabled = false;
      input.value = '';
    }
  });
}
