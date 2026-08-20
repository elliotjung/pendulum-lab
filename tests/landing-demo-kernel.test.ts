import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rhsDouble } from '../src/physics/double';
import {
  DEMO_KERNEL_VERSION,
  createRk4Work,
  rhsDoubleInto,
  rk4StepDouble
} from '../src/integrations/landingDemoKernel';
import { replaceLandingKernelPair, validateLandingKernelManifest } from '../scripts/landing-kernel-sync';

describe('Lab-generated landing demo kernel', () => {
  const parameters = { m1: 1.1, m2: 0.8, l1: 1.2, l2: 0.9, g: 9.81, damping: 0.07 };

  it('delegates every derivative to the authoritative Lab rhsDouble implementation', () => {
    const state = new Float64Array([0.7, -0.2, 0.4, -0.1]);
    const expected = new Float64Array(4);
    const actual = new Float64Array(4);
    rhsDouble(state, parameters, parameters.damping, expected);
    rhsDoubleInto(state, actual, parameters);
    expect([...actual]).toEqual([...expected]);
  });

  it('offers allocation-reusing RK4 with guarded time steps', () => {
    const state = new Float64Array([0.3, -0.1, 0, 0]);
    const work = createRk4Work();
    const returned = rk4StepDouble(state, parameters, 0.002, work);
    expect(returned).toBe(state);
    expect([...state].every(Number.isFinite)).toBe(true);
    expect(() => rk4StepDouble(state, parameters, 0, work)).toThrow(/dt/);
    expect(DEMO_KERNEL_VERSION).toBe('pendulum-demo-kernel/v3');
  });

  it('binds the copied bytes to package version and source commit', () => {
    expect(() =>
      validateLandingKernelManifest(
        {
          schemaVersion: 'pendulum-demo-kernel-manifest/v1',
          kernel: 'assets/pendulum-demo-kernel.js',
          kernelVersion: 'pendulum-demo-kernel/v3',
          sourcePackageVersion: '10.36.0',
          sourceCommit: 'a'.repeat(40),
          sha256: 'b'.repeat(64)
        },
        { packageVersion: '10.36.0', sourceCommit: 'a'.repeat(40), kernelSha256: 'b'.repeat(64) }
      )
    ).not.toThrow();
  });

  it('stages and validates the complete kernel pair before replacing either destination', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pendulum-landing-kernel-pair-'));
    const source = join(directory, 'source');
    const assets = join(directory, 'assets');
    const kernelName = 'pendulum-demo-kernel.js';
    const manifestName = 'demo-kernel-manifest.json';
    const packageVersion = '10.36.0';
    const sourceCommit = 'c'.repeat(40);
    const oldKernel = Buffer.from('export const oldKernel = true;\n');
    const oldManifest = Buffer.from('{"old":true}\n');
    const newKernel = Buffer.from('export const exactKernel = true;\n');
    const kernelSha256 = createHash('sha256').update(newKernel).digest('hex');
    const manifest = {
      schemaVersion: 'pendulum-demo-kernel-manifest/v1',
      kernel: 'assets/pendulum-demo-kernel.js',
      kernelVersion: 'pendulum-demo-kernel/v3',
      sourcePackageVersion: packageVersion,
      sourceCommit,
      sha256: kernelSha256
    };

    try {
      await Promise.all([mkdir(source), mkdir(assets)]);
      await Promise.all([
        writeFile(join(source, kernelName), newKernel),
        writeFile(join(source, manifestName), `${JSON.stringify(manifest)}\n`),
        writeFile(join(assets, kernelName), oldKernel),
        writeFile(join(assets, manifestName), oldManifest)
      ]);

      const invalidManifest = { ...manifest, sha256: '0'.repeat(64) };
      await writeFile(join(source, manifestName), `${JSON.stringify(invalidManifest)}\n`);
      await expect(
        replaceLandingKernelPair({
          sourceKernelPath: join(source, kernelName),
          sourceManifestPath: join(source, manifestName),
          destinationAssets: assets,
          packageVersion,
          sourceCommit
        })
      ).rejects.toThrow(/SHA-256 mismatch/);
      await expect(readFile(join(assets, kernelName))).resolves.toEqual(oldKernel);
      await expect(readFile(join(assets, manifestName))).resolves.toEqual(oldManifest);

      await writeFile(join(source, manifestName), `${JSON.stringify(manifest)}\n`);
      await replaceLandingKernelPair({
        sourceKernelPath: join(source, kernelName),
        sourceManifestPath: join(source, manifestName),
        destinationAssets: assets,
        packageVersion,
        sourceCommit
      });
      await expect(readFile(join(assets, kernelName))).resolves.toEqual(newKernel);
      await expect(readFile(join(assets, manifestName), 'utf8')).resolves.toContain(sourceCommit);
      await expect(readFile(join(assets, '.demo-kernel-pair.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
