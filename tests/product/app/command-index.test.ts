import { describe, expect, it } from 'vitest';
import { catalog } from '../../../src/product/catalog';
import { parseProductRoute } from '../../../src/product/contracts/routes';
import { commandAnalysisTarget, productCommands, searchProductCommands } from '../../../src/product/app/command-index';

describe('S28 product command discovery', () => {
  it('discovers every published lesson, system and analysis through real native routes', () => {
    const commands = productCommands();
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    expect(commands.filter((c) => c.id.startsWith('unit:'))).toHaveLength(86);
    for (const definition of [...catalog.systems, ...catalog.analyses])
      expect(commands.some((c) => c.id === definition.id)).toBe(true);
    expect(commands.every((c) => parseProductRoute(c.route).ok)).toBe(true);
  });
  it('matches Korean, English and stable IDs without changing settings or executing code', () => {
    const commands = productCommands();
    expect(searchProductCommands(commands, 'double pendulum').some((c) => c.id === 'system:double')).toBe(true);
    expect(searchProductCommands(commands, 'Lyapunov').some((c) => c.id === 'analysis:lyapunov')).toBe(true);
    expect(searchProductCommands(commands, '1.1').some((c) => c.id === 'unit:1.1')).toBe(true);
    expect(searchProductCommands(commands, '<script>alert(1)</script>')).toEqual([]);
  });
  it('opens exact native core, advanced and stability selectors for their aliases', () => {
    expect(commandAnalysisTarget('analysis:fft')).toEqual({
      container: 'core-diagnostics',
      select: 'core-diagnostic-kind',
      kind: 'fft'
    });
    expect(commandAnalysisTarget('analysis:rqa').container).toBe('advanced-diagnostics');
    expect(commandAnalysisTarget('analysis:arclength')).toEqual({
      container: 'stability-workflow',
      select: 'stability-kind',
      kind: 'pseudo-arclength'
    });
  });
});
