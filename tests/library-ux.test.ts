import { describe, expect, it } from 'vitest';
import {
  diffObjects,
  filterExperiments,
  forkExperimentData,
  qualityBadges,
  timelineGroups,
  validateDoi
} from '../src/research/libraryUx';

const experiments = [
  {
    id: 'a',
    name: 'Baseline RK4',
    notes: 'clean run',
    tags: ['baseline', 'rk4'],
    favorite: true,
    createdAt: '2026-06-09T10:00:00Z'
  },
  { id: 'b', name: 'Chaotic sweep', notes: 'lambda positive', tags: ['chaos'], createdAt: '2026-06-09T12:00:00Z' },
  {
    id: 'c',
    name: 'Damped study',
    notes: 'see DOI',
    tags: ['damping'],
    createdAt: '2026-06-10T09:00:00Z',
    citation: { doi: '10.1234/xyz', reference: 'Foo 2026' }
  }
];

describe('library filtering', () => {
  it('searches across name, notes, tags, and DOI', () => {
    expect(filterExperiments(experiments, { query: 'rk4', tag: '', favoritesOnly: false }).map((e) => e.id)).toEqual([
      'a'
    ]);
    expect(filterExperiments(experiments, { query: 'lambda', tag: '', favoritesOnly: false }).map((e) => e.id)).toEqual(
      ['b']
    );
    expect(
      filterExperiments(experiments, { query: '10.1234', tag: '', favoritesOnly: false }).map((e) => e.id)
    ).toEqual(['c']);
    expect(filterExperiments(experiments, { query: '', tag: '', favoritesOnly: false })).toHaveLength(3);
  });

  it('filters by tag and favorites', () => {
    expect(filterExperiments(experiments, { query: '', tag: 'chaos', favoritesOnly: false }).map((e) => e.id)).toEqual([
      'b'
    ]);
    expect(filterExperiments(experiments, { query: '', tag: '', favoritesOnly: true }).map((e) => e.id)).toEqual(['a']);
    expect(filterExperiments(experiments, { query: 'sweep', tag: 'baseline', favoritesOnly: false })).toHaveLength(0);
  });
});

describe('experiment diff', () => {
  it('reports only changed fields and ignores hashes/timestamps', () => {
    const a = { snapshot: { dt: 0.003, method: 'rk4', hash: 'aaa', state: [1, 2] }, notes: 'x' };
    const b = { snapshot: { dt: 0.001, method: 'rk4', hash: 'bbb', state: [1, 3] }, notes: 'x' };
    const rows = diffObjects(a, b);
    const fields = rows.map((row) => row.field);
    expect(fields).toContain('snapshot.dt');
    expect(fields).toContain('snapshot.state[1]');
    expect(fields).not.toContain('snapshot.hash');
    expect(fields).not.toContain('snapshot.method');
    const dtRow = rows.find((row) => row.field === 'snapshot.dt')!;
    expect(dtRow.a).toBe('0.003');
    expect(dtRow.b).toBe('0.001');
  });

  it('marks absent fields explicitly', () => {
    const rows = diffObjects({ a: 1 }, { b: 2 });
    expect(rows.find((row) => row.field === 'a')!.b).toBe('(absent)');
    expect(rows.find((row) => row.field === 'b')!.a).toBe('(absent)');
  });
});

describe('quality badges', () => {
  const base = {
    hasSnapshotHash: true,
    validationStatus: 'PASS',
    drift: 1e-9,
    lambdaMax: -0.1,
    qualityScore: 90,
    hasNotes: true,
    hasTags: true
  };

  it('grants export-ready only when fully documented, validated, reproducible', () => {
    expect(qualityBadges(base)).toEqual(['reproducible', 'validated', 'export-ready']);
  });

  it('flags unstable for chaotic or drifting states without removing other badges', () => {
    const badges = qualityBadges({ ...base, lambdaMax: 1.2 });
    expect(badges).toContain('unstable');
    expect(badges).toContain('reproducible');
    expect(qualityBadges({ ...base, drift: 0.5 })).toContain('unstable');
  });

  it('marks incomplete when validation or notes are missing', () => {
    expect(qualityBadges({ ...base, validationStatus: 'not-run' })).toContain('incomplete');
    expect(qualityBadges({ ...base, hasNotes: false })).toContain('incomplete');
    expect(qualityBadges({ ...base, hasNotes: false })).not.toContain('export-ready');
  });
});

describe('timeline and fork', () => {
  it('groups experiments by day, newest first', () => {
    const groups = timelineGroups(experiments);
    expect(groups.map((group) => group.day)).toEqual(['2026-06-10', '2026-06-09']);
    expect(groups[1]!.items.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('fork copies deeply with new identity and lineage note', () => {
    const original = { ...experiments[0]!, snapshot: { state: [1, 2] } };
    const fork = forkExperimentData(original, 'new-id', '2026-06-11T00:00:00Z');
    expect(fork.id).toBe('new-id');
    expect(fork.name).toBe('Baseline RK4 (fork)');
    expect(fork.notes).toContain('Forked from a');
    expect(fork.snapshot).toEqual(original.snapshot);
    expect(fork.snapshot).not.toBe(original.snapshot); // deep copy
  });
});

describe('DOI validation', () => {
  it('accepts valid DOIs and empty strings, rejects junk', () => {
    expect(validateDoi('10.1234/abc.def')).toBe(true);
    expect(validateDoi('')).toBe(true);
    expect(validateDoi('  ')).toBe(true);
    expect(validateDoi('doi:10.1234/abc')).toBe(false);
    expect(validateDoi('http://example.com')).toBe(false);
  });
});
