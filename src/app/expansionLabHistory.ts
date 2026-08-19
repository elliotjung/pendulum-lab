import type { ExpansionModelId, ExpansionSuiteResult } from '../physics/expandedModels';
import type { DomBinder } from './DomBinder';
import { formatExpansionValue } from './expansionLabRendering';

const HISTORY_KEY = 'pendulum-lab/expansion-history';
const MAX_SAVED_HISTORY = 24;
const MAX_RENDERED_HISTORY = 8;

export interface ExpansionHistoryEntry {
  hash: string;
  model: ExpansionModelId;
  modelLabel: string;
  bestMethod: string;
  bestScore: number;
  dt: number;
  horizon: number;
  createdAt: string;
}

function isHistoryEntry(value: unknown): value is ExpansionHistoryEntry {
  return typeof value === 'object' && value !== null && typeof (value as { hash?: unknown }).hash === 'string';
}

/** Local-only, bounded experiment-history persistence for Expansion Lab. */
export class ExpansionLabHistory {
  constructor(private readonly dom: DomBinder) {}

  read(): ExpansionHistoryEntry[] {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(HISTORY_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
    } catch {
      return [];
    }
  }

  remember(result: ExpansionSuiteResult): void {
    const entry: ExpansionHistoryEntry = {
      hash: result.manifest.hash,
      model: result.model,
      modelLabel: result.modelLabel,
      bestMethod: result.summary.bestMethod,
      bestScore: result.summary.bestScore,
      dt: result.dt,
      horizon: result.horizon,
      createdAt: result.generatedAt
    };
    this.write([entry, ...this.read().filter((item) => item.hash !== entry.hash)]);
  }

  clear(): void {
    this.write([]);
  }

  render(): void {
    const box = this.dom.el('expHistory');
    if (!box) return;
    const history = this.read();
    if (history.length === 0) {
      box.textContent = 'No expansion experiments saved yet.';
      return;
    }
    box.replaceChildren();
    for (const entry of history.slice(0, MAX_RENDERED_HISTORY)) {
      const row = document.createElement('div');
      row.className = 'exp-history-row';
      row.textContent = `${entry.hash} · ${entry.modelLabel} · best ${entry.bestMethod} (${formatExpansionValue(entry.bestScore, 1)}) · ${entry.horizon}s`;
      box.append(row);
    }
  }

  private write(entries: readonly ExpansionHistoryEntry[]): void {
    try {
      window.localStorage?.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_SAVED_HISTORY)));
    } catch {
      // History is a convenience. Export remains available in storage-restricted contexts.
    }
  }
}
