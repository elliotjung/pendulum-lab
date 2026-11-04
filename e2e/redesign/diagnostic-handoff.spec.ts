import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../src/product/adapters/physics/planar';
import { defaultDrivenConfig, toCanonicalDriven } from '../../src/product/adapters/physics/driven';
import { defaultNonlinearConfig, toCanonicalNonlinear } from '../../src/product/adapters/physics/nonlinear';
import { defaultCoreSettings } from '../../src/product/adapters/analysis/core/settings';
import { defaultAdvancedSettings } from '../../src/product/adapters/analysis/advanced/settings';
import { toDiagnosticAnalysis } from '../../src/product/lab/views/diagnostic-handoff';
import { createExperimentRoute } from '../../src/product/persistence';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';

const unwrap = <T>(value: { ok: true; value: T } | { ok: false; issues: readonly unknown[] }): T => {
  if (!value.ok) throw new Error(JSON.stringify(value.issues));
  return value.value;
};
const provenance = (id: string) => ({
  createdByVersion: 'product-focus-v1',
  source: { kind: 'derived' as const, id: `learn:course-${id[0]}:${id}:v1` },
  parentExperimentIds: []
});
async function stateJson(page: Page): Promise<ExperimentStateV1> {
  await page.getByRole('tab', { name: '내보내기', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '상태 JSON 다운로드', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return JSON.parse(await readFile((await file.path())!, 'utf8')) as ExperimentStateV1;
}
async function open(page: Page, canonical: ExperimentStateV1) {
  await page.goto(`/next.html${unwrap(createExperimentRoute(canonical))}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  expect(await stateJson(page)).toEqual(canonical);
  await page.getByRole('tab', { name: '분석', exact: true }).click();
}

test.describe('S26 exact native diagnostic handoff', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const messages: string[] = [];
    errors.set(page, messages);
    page.on('pageerror', (error) => messages.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') messages.push(message.text());
    });
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

  test('restores S18 spectrum settings, preserves valid edits through save/reload, and leaves legacy dock usable', async ({
    page
  }) => {
    const analysis = toDiagnosticAnalysis('core', {
      kind: 'lyapunov',
      settings: {
        ...defaultCoreSettings('lyapunov'),
        duration: 0.2,
        renormEvery: 3,
        count: 4,
        seed: 127
      }
    });
    const canonical = unwrap(
      toCanonicalPlanar({
        ...defaultPlanarConfig(),
        duration: 0.256,
        step: 0.002,
        analyses: [analysis],
        provenance: provenance('5.6')
      })
    );
    await open(page, canonical);
    await expect(page.locator('#core-analysis-kind')).toHaveValue('state-time');
    await expect(page.locator('#core-analysis .ds-field__error')).toBeHidden();
    await page.locator('#core-diagnostics > summary').click();
    await expect(page.locator('#core-diagnostic-kind')).toHaveValue('lyapunov');
    await expect(page.locator('#core-diagnostic-renormEvery')).toHaveValue('3');
    await expect(page.locator('#core-diagnostic-count')).toHaveValue('4');
    await expect(page.locator('#core-diagnostic-seed')).toHaveValue('127');
    await page.locator('#core-diagnostic-renormEvery').fill('4');
    const expected = {
      ...canonical,
      analyses: [
        {
          ...analysis,
          settings: { ...analysis.settings, renormEvery: { kind: 'scalar' as const, value: 4, unit: '1' as const } }
        }
      ]
    };
    expect(await stateJson(page)).toEqual(expected);
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await page.goto('/next.html#/lab/double');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    expect(await stateJson(page)).toEqual(expected);
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#core-diagnostics > summary').click();
    await expect(page.locator('#core-diagnostic-renormEvery')).toHaveValue('4');
    await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'completed');
    const artifact = JSON.parse((await page.locator('.core-diagnostic-json').textContent())!);
    expect(artifact.request.settings).toEqual({
      ...defaultCoreSettings('lyapunov'),
      duration: 0.2,
      renormEvery: 4,
      count: 4,
      seed: 127
    });
    expect(artifact.request.experiment).toEqual(expected);
  });

  test('restores primary NAFF and secondary FFT settings without replacing either with defaults', async ({ page }) => {
    const naff = toDiagnosticAnalysis('core', {
      kind: 'naff',
      settings: { ...defaultCoreSettings('naff'), terms: 2, refineIterations: 64 }
    });
    const fft = toDiagnosticAnalysis('core', {
      kind: 'fft',
      settings: { ...defaultCoreSettings('fft'), transient: 0.1, window: 'none' }
    });
    const canonical = unwrap(
      toCanonicalPlanar({
        ...defaultPlanarConfig(),
        duration: 0.512,
        step: 0.002,
        analyses: [naff, fft],
        provenance: provenance('5.3')
      })
    );
    await open(page, canonical);
    await page.locator('#core-diagnostics > summary').click();
    await expect(page.locator('#core-diagnostic-kind')).toHaveValue('naff');
    await expect(page.locator('#core-diagnostic-terms')).toHaveValue('2');
    await expect(page.locator('#core-diagnostic-refineIterations')).toHaveValue('64');
    await page.locator('#core-diagnostic-kind').selectOption('fft');
    await expect(page.locator('#core-diagnostic-window')).toHaveValue('none');
    await expect(page.locator('#core-diagnostic-transient')).toHaveValue('0.1');
    expect(await stateJson(page)).toEqual(canonical);
  });

  test('restores native RQA embedding, threshold and Theiler settings and preserves valid edits', async ({ page }) => {
    const analysis = toDiagnosticAnalysis('advanced', {
      kind: 'rqa',
      settings: {
        ...defaultAdvancedSettings('rqa'),
        dimension: 3,
        delay: 2,
        targetRecurrenceRate: 0.2,
        theiler: 3,
        maxSamples: 128
      }
    });
    const canonical = unwrap(
      toCanonicalPlanar({
        ...defaultPlanarConfig(),
        duration: 0.512,
        step: 0.002,
        analyses: [analysis],
        provenance: provenance('5.10')
      })
    );
    await open(page, canonical);
    await page.locator('#advanced-diagnostics > summary').click();
    await expect(page.locator('#advanced-diagnostic-kind')).toHaveValue('rqa');
    for (const [key, value] of Object.entries({
      dimension: 3,
      delay: 2,
      targetRecurrenceRate: 0.2,
      theiler: 3,
      maxSamples: 128
    }))
      await expect(page.locator(`#advanced-diagnostic-${key}`)).toHaveValue(String(value));
    await page.locator('#advanced-diagnostic-targetRecurrenceRate').fill('0.15');
    const expected = {
      ...canonical,
      analyses: [
        {
          ...analysis,
          settings: {
            ...analysis.settings,
            targetRecurrenceRate: { kind: 'scalar' as const, value: 0.15, unit: '1' as const }
          }
        }
      ]
    };
    expect(await stateJson(page)).toEqual(expected);
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(report.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) }))).toEqual(
      []
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  for (const system of ['driven', 'pyragas'] as const) {
    test(`${system}: exposes the validated source-unit return link and preserves exact physical restart`, async ({
      page
    }) => {
      const id = system === 'driven' ? '4.2' : '4.10';
      const canonical =
        system === 'driven'
          ? unwrap(toCanonicalDriven({ ...defaultDrivenConfig('system:driven'), provenance: provenance(id) }))
          : unwrap(toCanonicalNonlinear({ ...defaultNonlinearConfig('system:pyragas'), provenance: provenance(id) }));
      await open(page, canonical);
      await expect(page.getByRole('link', { name: '단원으로 돌아가기', exact: true })).toHaveAttribute(
        'href',
        `#/learn/course-4/${id}`
      );
    });
  }
});
