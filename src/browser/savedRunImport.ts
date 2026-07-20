import { commitLabControls } from '../app/controlCommit';
import { stateStore } from '../state/StateStore';
import type { StateStore } from '../state/StateStore';
import type { ImportValidationResult, RuntimeSnapshot } from '../types/domain';
import { MAX_JSON_BYTES, parseStrictJsonImport } from '../validation/importSchema';
import { validateLabSnapshot } from '../validation/sessionConstraints';
import { eventBus } from '../runtime/EventBus';

type SavedRunStore = Pick<StateStore, 'applyPatch'>;

/** Parse with the hardened schema guard, then mutate state only after success. */
export function parseAndApplySavedRun(
  text: string,
  store: SavedRunStore = stateStore
): ImportValidationResult<RuntimeSnapshot> {
  const parsed = parseStrictJsonImport(text);
  if (!parsed.ok || !parsed.value) {
    eventBus.emit('security:import-rejected', { problems: parsed.problems });
    return parsed;
  }
  const labValidation = validateLabSnapshot(parsed.value);
  if (!labValidation.ok || !labValidation.value) {
    eventBus.emit('security:import-rejected', { problems: labValidation.problems });
    return labValidation;
  }
  try {
    return { ok: true, problems: [], value: store.applyPatch(labValidation.value) };
  } catch (error) {
    const result: ImportValidationResult<RuntimeSnapshot> = {
      ok: false,
      problems: [`could not apply imported state: ${error instanceof Error ? error.message : String(error)}`]
    };
    eventBus.emit('security:import-rejected', { problems: result.problems });
    return result;
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
  exactRangeProjection: boolean;
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
      planned.push({ element, id, value: next, numericValue: null, exactRangeProjection: false });
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
    let exactRangeProjection = false;
    if (numericValue !== null && element.type === 'range' && element.step !== 'any') {
      const step = element.step === '' ? 1 : Number(element.step);
      const base = element.min === '' ? 0 : Number(element.min);
      const units = (numericValue - base) / step;
      exactRangeProjection = Number.isFinite(step) && step > 0 && Math.abs(units - Math.round(units)) > 1e-9;
    }
    planned.push({ element, id, value: next, numericValue, exactRangeProjection });
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
  const previous = plan.value.map(({ element }) => ({
    value: element.value,
    step: element instanceof HTMLInputElement ? element.step : ''
  }));
  const rollback = (): void => {
    plan.value!.forEach(({ element }, index) => {
      if (element instanceof HTMLInputElement) {
        element.step = previous[index]?.step ?? element.step;
        delete element.dataset.importStep;
      }
      element.value = previous[index]?.value ?? '';
    });
  };
  const applied: string[] = [];
  try {
    for (const { element, id, value, numericValue, exactRangeProjection } of plan.value) {
      if (element instanceof HTMLInputElement && exactRangeProjection) {
        element.dataset.importStep ??= element.step;
        element.step = 'any';
        if (element.dataset.importStepBound !== 'true') {
          element.dataset.importStepBound = 'true';
          element.addEventListener('change', () => {
            const originalStep = element.dataset.importStep;
            if (originalStep !== undefined) element.step = originalStep;
            delete element.dataset.importStep;
          });
        }
      }
      element.value = value;
      const readBackMatches =
        numericValue === null
          ? element.value === value
          : element instanceof HTMLInputElement &&
            Number.isFinite(element.valueAsNumber) &&
            element.valueAsNumber === numericValue;
      if (!readBackMatches) {
        rollback();
        return { ok: false, problems: [`Lab control #${id} changed ${value} to ${element.value}`] };
      }
      applied.push(id);
    }
    for (const { element } of plan.value) element.dispatchEvent(new Event('input', { bubbles: true }));
    commitLabControls('saved-run-import', applied, snapshot);
  } catch (error: unknown) {
    rollback();
    return {
      ok: false,
      problems: [`Lab controls could not commit atomically: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
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

function rejectImport(problems: string[], prefix = 'Import rejected'): void {
  eventBus.emit('security:import-rejected', { problems });
  notify(`${prefix}: ${problems.slice(0, 3).join('; ')}`, 4200);
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
      rejectImport(['JSON file is too large']);
      input.value = '';
      return;
    }

    input.disabled = true;
    if (button instanceof HTMLButtonElement) button.disabled = true;
    try {
      const parsed = parseStrictJsonImport(await file.text());
      if (!parsed.ok || !parsed.value) {
        rejectImport(parsed.problems);
        return;
      }
      const labValidation = validateLabSnapshot(parsed.value);
      if (!labValidation.ok || !labValidation.value) {
        rejectImport(labValidation.problems);
        return;
      }
      const controlPlan = planSnapshotControls(labValidation.value);
      if (!controlPlan.ok) {
        rejectImport(controlPlan.problems);
        return;
      }
      const previous = stateStore.snapshot();
      const appliedSnapshot = stateStore.applyPatch(labValidation.value);
      const controls = applySnapshotControls(appliedSnapshot);
      if (!controls.ok) {
        stateStore.applyPatch(previous);
        rejectImport(controls.problems);
        return;
      }
      notify(`Saved state from t=${appliedSnapshot.simTime.toFixed(3)} s loaded`);
    } catch (error) {
      rejectImport([error instanceof Error ? error.message : String(error)], 'Import failed');
    } finally {
      input.disabled = false;
      if (button instanceof HTMLButtonElement) button.disabled = false;
      input.value = '';
    }
  });
}
