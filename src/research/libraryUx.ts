/**
 * Research library UX logic: search/tag/favourite filtering, experiment
 * diffing, quality badges, and timeline grouping. Pure functions over plain
 * data so the workbench UI stays a thin renderer and everything here is
 * unit-testable.
 */

export interface LibraryExperimentView {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  favorite?: boolean;
  createdAt: string;
  citation?: { doi: string; reference: string };
}

export interface LibraryFilter {
  query: string;
  tag: string;
  favoritesOnly: boolean;
}

export function filterExperiments<T extends LibraryExperimentView>(
  experiments: readonly T[],
  filter: LibraryFilter
): T[] {
  const query = filter.query.trim().toLowerCase();
  const tag = filter.tag.trim().toLowerCase();
  return experiments.filter((experiment) => {
    if (filter.favoritesOnly && !experiment.favorite) return false;
    if (tag && !experiment.tags.some((candidate) => candidate.toLowerCase().includes(tag))) return false;
    if (!query) return true;
    const haystack =
      `${experiment.name} ${experiment.notes} ${experiment.tags.join(' ')} ${experiment.citation?.doi ?? ''} ${experiment.citation?.reference ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

export interface DiffRow {
  field: string;
  a: string;
  b: string;
}

function flatten(value: unknown, prefix: string, out: Map<string, string>, depth = 0): void {
  if (depth > 4) return;
  if (value === null || value === undefined) {
    out.set(prefix, String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return;
  }
  out.set(
    prefix,
    typeof value === 'number' && Number.isFinite(value) ? Number(value.toPrecision(10)).toString() : String(value)
  );
}

/** Field-level diff of two snapshot-like objects; only changed fields are returned. */
export function diffObjects(a: unknown, b: unknown, ignore: readonly string[] = ['hash', 'timestamp']): DiffRow[] {
  const mapA = new Map<string, string>();
  const mapB = new Map<string, string>();
  flatten(a, '', mapA);
  flatten(b, '', mapB);
  const fields = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: DiffRow[] = [];
  for (const field of [...fields].sort()) {
    if (ignore.some((suffix) => field === suffix || field.endsWith(`.${suffix}`))) continue;
    const valueA = mapA.get(field) ?? '(absent)';
    const valueB = mapB.get(field) ?? '(absent)';
    if (valueA !== valueB) rows.push({ field, a: valueA, b: valueB });
  }
  return rows;
}

export type QualityBadge = 'reproducible' | 'validated' | 'unstable' | 'incomplete' | 'export-ready';

export interface BadgeInput {
  hasSnapshotHash: boolean;
  validationStatus: string;
  drift: number | null;
  lambdaMax: number | null;
  qualityScore: number;
  hasNotes: boolean;
  hasTags: boolean;
}

/**
 * Quality badges with explicit semantics:
 * - reproducible: snapshot hash present (state can be re-instantiated bit-for-bit)
 * - validated: the validation suite passed for this state
 * - unstable: chaotic (λ > 0) or drifting (|drift| > 1e-2) — flag, not failure
 * - incomplete: missing validation or annotation needed for publication
 * - export-ready: reproducible + validated + documented
 */
export function qualityBadges(input: BadgeInput): QualityBadge[] {
  const badges: QualityBadge[] = [];
  const validated = /pass/i.test(input.validationStatus);
  if (input.hasSnapshotHash) badges.push('reproducible');
  if (validated) badges.push('validated');
  if ((input.lambdaMax !== null && input.lambdaMax > 0) || (input.drift !== null && Math.abs(input.drift) > 1e-2))
    badges.push('unstable');
  const incomplete = !validated || !input.hasNotes;
  if (incomplete) badges.push('incomplete');
  if (input.hasSnapshotHash && validated && input.hasNotes && input.hasTags && input.qualityScore >= 70)
    badges.push('export-ready');
  return badges;
}

export interface TimelineGroup {
  day: string;
  items: { id: string; name: string; time: string }[];
}

/** Group experiments by calendar day, newest first, for the timeline view. */
export function timelineGroups(experiments: readonly LibraryExperimentView[]): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  const sorted = [...experiments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const experiment of sorted) {
    const day = experiment.createdAt.slice(0, 10);
    let group = groups.get(day);
    if (!group) {
      group = { day, items: [] };
      groups.set(day, group);
    }
    group.items.push({ id: experiment.id, name: experiment.name, time: experiment.createdAt.slice(11, 19) });
  }
  return [...groups.values()];
}

/** Fork helper: deep-copies an experiment with a new identity and lineage note. */
export function forkExperimentData<T extends LibraryExperimentView & { snapshot: unknown }>(
  experiment: T,
  newId: string,
  now: string
): T {
  const copy = JSON.parse(JSON.stringify(experiment)) as T;
  copy.id = newId;
  copy.name = `${experiment.name} (fork)`;
  copy.createdAt = now;
  copy.notes =
    `${experiment.notes ? `${experiment.notes}\n` : ''}Forked from ${experiment.id} (${experiment.name}).`.trim();
  return copy;
}

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

export function validateDoi(doi: string): boolean {
  return doi.trim() === '' || DOI_PATTERN.test(doi.trim());
}
