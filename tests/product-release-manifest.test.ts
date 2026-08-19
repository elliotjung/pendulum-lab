import { describe, expect, it } from 'vitest';
import { extractLabCtas, sha256, validateEvidence, validateKernelManifest } from '../scripts/product-release-manifest';

const sourceCommit = 'a'.repeat(40);
const lockfileSha256 = 'b'.repeat(64);

function validEvidence() {
  return {
    schemaVersion: 'pendulum-evidence-summary/v1',
    provenance: {
      sourceCommit,
      packageVersion: '10.36.0',
      lockfileSha256,
      dirtyWorktree: false,
      expiresAt: '2099-01-01T00:00:00.000Z'
    },
    tests: { total: 1400, passed: 1400, failed: 0, success: true }
  };
}

describe('coordinated product release manifest', () => {
  it('extracts only canonical HTTPS Lab CTAs with the required final tab', () => {
    const html = `
      <a href="https://elliotjung.github.io/pendulum-lab/?audience=beginner&amp;tab=lab">Launch</a>
      <a href="https://elliotjung.github.io/pendulum-lab/?tab=research">Research</a>
      <a href="http://elliotjung.github.io/pendulum-lab/?tab=lab">Downgrade</a>
      <a href="https://attacker.invalid/?next=https://elliotjung.github.io/pendulum-lab/?tab=lab">Fake</a>
    `;

    expect(
      extractLabCtas(
        html,
        'https://elliotjung.github.io/pendulum-landing/index.html',
        'https://elliotjung.github.io/pendulum-lab/',
        'lab'
      )
    ).toEqual(['https://elliotjung.github.io/pendulum-lab/?audience=beginner&tab=lab']);
  });

  it('accepts only clean, current, successful evidence coordinates', () => {
    expect(() => validateEvidence(validEvidence(), { packageVersion: '10.36.0', lockfileSha256 })).not.toThrow();

    expect(() =>
      validateEvidence(
        { ...validEvidence(), provenance: { ...validEvidence().provenance, dirtyWorktree: true } },
        { packageVersion: '10.36.0', lockfileSha256 }
      )
    ).toThrow(/dirty worktree/);
    expect(() =>
      validateEvidence(
        { ...validEvidence(), tests: { total: 1400, passed: 1399, failed: 1, success: false } },
        { packageVersion: '10.36.0', lockfileSha256 }
      )
    ).toThrow(/successful complete run/);
    expect(() =>
      validateEvidence(validEvidence(), { packageVersion: '10.36.0', lockfileSha256: 'c'.repeat(64) })
    ).toThrow(/lockfile SHA-256/);
  });

  it('binds the deployed demo kernel to its manifest and evidence source', () => {
    const kernel = new TextEncoder().encode('export const kernel = true;\n');
    const digest = sha256(kernel);
    const manifest = {
      schemaVersion: 'pendulum-demo-kernel-manifest/v1',
      kernel: 'assets/pendulum-demo-kernel.js',
      kernelVersion: 'pendulum-demo-kernel/v2',
      sourcePackageVersion: '10.36.0',
      sourceCommit,
      sha256: digest
    };

    expect(() =>
      validateKernelManifest(manifest, {
        sourceCommit,
        packageVersion: '10.36.0',
        deployedKernelSha256: digest
      })
    ).not.toThrow();
    expect(() =>
      validateKernelManifest(manifest, {
        sourceCommit: 'd'.repeat(40),
        packageVersion: '10.36.0',
        deployedKernelSha256: digest
      })
    ).toThrow(/source commit/);
  });
});
