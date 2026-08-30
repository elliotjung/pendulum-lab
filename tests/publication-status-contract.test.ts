import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluatePublicationStatus,
  type PublicationHttpProbe,
  type PublicationStatusInput
} from '../scripts/publication-status-core';

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';
const INTEGRITY = `sha512-${createHash('sha512').update('exact tarball bytes').digest('base64')}`;

function ok(body: unknown): PublicationHttpProbe {
  return { ok: true, status: 200, body };
}

function fixture(): PublicationStatusInput {
  return {
    packageName: '@elliotjung/pendulum-lab',
    packageVersion: '10.36.0',
    repository: 'elliotjung/pendulum-lab',
    pagesUrl: 'https://example.test/reviewer.html',
    npm: ok({
      name: '@elliotjung/pendulum-lab',
      version: '10.36.0',
      dist: { integrity: INTEGRITY, shasum: 'a'.repeat(40) }
    }),
    zenodo: ok({
      hits: {
        hits: [
          {
            id: 42,
            doi: '10.5281/zenodo.1234567',
            metadata: { title: 'Pendulum Lab — nonlinear dynamics', version: '10.36.0' }
          }
        ]
      }
    }),
    release: ok({
      tag_name: 'v10.36.0',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/elliotjung/pendulum-lab/releases/tag/v10.36.0'
    }),
    releaseCommit: ok({ sha: SOURCE_SHA }),
    pages: { ok: true, status: 200 },
    pagesManifest: ok({ sourceCommit: SOURCE_SHA, evidenceSourceCommit: SOURCE_SHA }),
    pagesEvidence: ok({ provenance: { sourceCommit: SOURCE_SHA, packageVersion: '10.36.0' } })
  };
}

describe('publication status network contract', () => {
  it('bounds every fetch and probes independent exact-version services concurrently', () => {
    const source = readFileSync(resolve('scripts/publication-status.ts'), 'utf8');
    expect(source).toContain('AbortSignal.timeout(REQUEST_TIMEOUT_MS)');
    expect(source).toContain('signal: requestSignal()');
    expect(source).toMatch(/Promise\.all\(\[/u);
    expect(source).toContain('/releases/tags/');
    expect(source).toContain('/commits/');
    expect(source).toContain('deployment-manifest.json');
    expect(source).toContain('reports/evidence-summary.json');
  });

  it('keeps stale source snapshots from becoming current Reviewer success badges', () => {
    const reviewer = readFileSync(resolve('src/reviewer/main.ts'), 'utf8');
    const styles = readFileSync(resolve('src/reviewer/reviewer.css'), 'utf8');
    expect(reviewer).toContain("publicationDeployment: './reports/deployment-publication-status.json'");
    expect(reviewer).toContain("deploymentManifest: './deployment-manifest.json'");
    expect(reviewer).toContain("type PublicationFreshness = 'current' | 'stale' | 'unknown'");
    expect(reviewer).toContain("schemaVersion !== 'pendulum-publication-status/v2'");
    expect(reviewer).toContain('checkedSourceCommit');
    expect(reviewer).toContain('report.checkedSourceCommit === deployedSourceCommit');
    expect(reviewer).toContain("freshness === 'current'");
    expect(reviewer).toContain('current status unknown');
    expect(reviewer).toContain('How to read this evidence');
    expect(reviewer).toContain('Finite-time agreement does not guarantee identical long-horizon chaotic trajectories');
    expect(styles).toContain('.status-published');
    expect(styles).toContain('.status-failed');
    expect(styles).toContain('.status-stale');
    expect(styles).toContain('.status-unknown');
  });

  it('publishes only when npm, Zenodo, GitHub, and Pages bind the exact version and source', () => {
    const report = evaluatePublicationStatus(fixture());
    expect(report.status).toBe('published');
    expect(report.npm).toMatchObject({ published: true, identityMatches: true, integrity: INTEGRITY });
    expect(report.zenodo).toMatchObject({ published: true, versionMatches: true, version: '10.36.0' });
    expect(report.githubRelease).toMatchObject({
      published: true,
      expectedTag: 'v10.36.0',
      tagMatches: true,
      sourceCommit: SOURCE_SHA
    });
    expect(report.pages).toMatchObject({ published: true, binding: 'verified', sourceCommit: SOURCE_SHA });
    expect(report.caveats).toEqual([]);
  });

  it('does not accept a title-only Zenodo match or a release for another tag', () => {
    const input = fixture();
    input.zenodo = ok({
      hits: {
        hits: [
          {
            id: 41,
            doi: '10.5281/zenodo.7654321',
            metadata: { title: 'Pendulum Lab', version: '10.35.0' }
          }
        ]
      }
    });
    input.release = ok({ tag_name: 'v10.35.0', draft: false, prerelease: false });
    const report = evaluatePublicationStatus(input);
    expect(report.status).toBe('failed');
    expect(report.zenodo).toMatchObject({ published: false, versionMatches: false, doi: null });
    expect(report.githubRelease).toMatchObject({ published: false, tagMatches: false });
  });

  it('fails when Zenodo responds successfully but only another version exists', () => {
    const input = fixture();
    input.zenodo = ok({
      hits: {
        hits: [
          {
            id: 41,
            doi: '10.5281/zenodo.7654321',
            metadata: { title: 'Pendulum Lab', version: '10.35.0' }
          }
        ]
      }
    });
    const report = evaluatePublicationStatus(input);
    expect(report.status).toBe('failed');
    expect(report.zenodo).toMatchObject({ published: false, versionMatches: false, doi: null });
  });

  it('fails closed on mismatched npm identity/integrity and deployed source provenance', () => {
    const input = fixture();
    input.npm = ok({
      name: '@elliotjung/pendulum-lab',
      version: '10.35.0',
      dist: { integrity: 'not-an-integrity' }
    });
    input.pagesManifest = ok({ sourceCommit: 'f'.repeat(40), evidenceSourceCommit: SOURCE_SHA });
    const report = evaluatePublicationStatus(input);
    expect(report.status).toBe('failed');
    expect(report.npm).toMatchObject({ published: false, identityMatches: false, integrity: null });
    expect(report.pages).toMatchObject({ published: false, binding: 'failed' });
  });

  it('reports unavailable services and non-exposed Pages bindings as partial, never published', () => {
    const input = fixture();
    input.zenodo = { ok: false, status: 503, body: null };
    input.pagesManifest = { ok: false, status: 404, body: null };
    input.pagesEvidence = { ok: false, status: 404, body: null };
    const report = evaluatePublicationStatus(input);
    expect(report.status).toBe('partial');
    expect(report.zenodo.published).toBe(false);
    expect(report.pages).toMatchObject({ published: false, binding: 'unavailable' });
  });

  it('treats malformed successful JSON and noncanonical integrity as contradictions', () => {
    const input = fixture();
    input.npm = ok({
      name: '@elliotjung/pendulum-lab',
      version: '10.36.0',
      dist: { integrity: 'sha512-YWJj' }
    });
    input.pagesManifest = { ok: false, status: 200, body: null };
    const report = evaluatePublicationStatus(input);
    expect(report.status).toBe('failed');
    expect(report.npm).toMatchObject({ published: false, identityMatches: true, integrity: null });
    expect(report.pages).toMatchObject({ published: false, binding: 'failed' });
  });
});
