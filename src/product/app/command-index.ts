import { catalog } from '../catalog';
import { courses } from '../../../content/learn/curriculum';

export interface ProductCommand {
  readonly id: string;
  readonly label: string;
  readonly keywords: string;
  readonly route: string;
  readonly analysisId?: string;
}

/** Public catalog/lesson metadata only; discovery never runs a computation. */
export function productCommands(): ProductCommand[] {
  return [
    { id: 'space:learn', label: '배우기 · Learn', keywords: 'courses lessons 과정 단원', route: '#/learn' },
    { id: 'space:lab', label: '실험실 · Laboratory', keywords: 'systems experiment 시스템 실험', route: '#/lab' },
    ...catalog.systems.map((system) => ({
      id: system.id,
      label: `${system.name.ko} · ${system.name.en}`,
      keywords: [system.id, system.description.ko, system.description.en, ...system.tags].join(' '),
      route: `#/lab/${system.id.slice(7)}`
    })),
    ...catalog.analyses.map((analysis) => ({
      id: analysis.id,
      label: `${analysis.name.ko} · ${analysis.name.en}`,
      keywords: [analysis.id, analysis.description.ko, analysis.description.en, ...analysis.tags].join(' '),
      route: analysisRoute(analysis.id),
      analysisId: analysis.id
    })),
    ...courses.flatMap((course) =>
      course.units
        .filter((unit) => unit.availability === 'published')
        .map((unit) => ({
          id: `unit:${unit.id}`,
          label: `${unit.id} · ${unit.title.ko} · ${unit.title.en}`,
          keywords: `${course.title.ko} ${course.title.en} learn lesson 단원`,
          route: `#/learn/${course.id}/${unit.id}`
        }))
    )
  ];
}

export function searchProductCommands(commands: readonly ProductCommand[], query: string): ProductCommand[] {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const text = `${command.id} ${command.label} ${command.keywords}`.normalize('NFKC').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

const core = new Set([
  'state-time',
  'energy',
  'phase',
  'fft',
  'naff',
  'poincare',
  'lyapunov',
  'sali',
  'fli',
  'zero-one',
  'shadowing'
]);
const advanced = new Set([
  'rqa',
  'recurrence-network',
  'correlation-dimension',
  'multifractal',
  'topological-entropy',
  'transfer-operator',
  'clv',
  'ftle',
  'lcs-ridge',
  'basin',
  'uncertainty',
  'wada'
]);
const stability = new Set([
  'fixed-point',
  'periodic-shooting',
  'floquet',
  'melnikov',
  'continuation',
  'pseudo-arclength',
  'branch-switch',
  'neimark-sacker',
  'torus',
  'arnold-tongue',
  'codim-two'
]);
export function analysisRoute(id: string) {
  const physical: Record<string, string> = {
    'analysis:chimera': 'kuramoto',
    'analysis:lattice-dispersion': 'lattice-fk-limit',
    'analysis:fk-kink-pinning': 'frenkel-kontorova',
    'analysis:kramers': 'langevin',
    'analysis:stochastic-resonance': 'langevin'
  };
  return `#/lab/${physical[id] ?? 'double'}`;
}
export interface CommandAnalysisTarget {
  container: string;
  select: string;
  kind: string;
  tab?: 'tray';
  forceRoute?: boolean;
}
export function commandAnalysisTarget(id: string): CommandAnalysisTarget {
  const aliases: Record<string, string> = {
    'sali-fli': 'sali',
    'periodic-orbits': 'periodic-shooting',
    arclength: 'pseudo-arclength',
    'codimension-two': 'codim-two',
    'bifurcation-detection': 'continuation',
    'floquet-linear': 'floquet'
  };
  const slug = id.replace(/^analysis:/, '');
  const kind = aliases[slug] ?? slug;
  if (kind === 'structure-validation') return { container: 'structure-diagnostics', select: '', kind };
  if (core.has(kind)) return { container: 'core-diagnostics', select: 'core-diagnostic-kind', kind };
  if (advanced.has(kind)) return { container: 'advanced-diagnostics', select: 'advanced-diagnostic-kind', kind };
  if (stability.has(kind)) return { container: 'stability-workflow', select: 'stability-kind', kind };
  if (kind === 'experiment-design') return { container: 'native-experiment-design', select: '', kind, tab: 'tray' };
  if (kind === 'integrator-comparison')
    return {
      container: 'batch-experiments',
      select: 'batch-kind',
      kind: 'integrators',
      tab: 'tray'
    };
  const inverse: Record<string, string> = {
    'parameter-estimation': 'estimate',
    sobol: 'sobol',
    'pce-surrogate': 'pce'
  };
  if (inverse[kind]) return { container: 'observation-research', select: 'research-kind', kind: inverse[kind]! };
  const physical: Record<string, [string, string, string]> = {
    chimera: ['network-analysis', 'network-plot-kind', 'local'],
    'lattice-dispersion': ['field-diagnostic-diatomic', '', ''],
    'fk-kink-pinning': ['field-diagnostic-pinning', '', ''],
    kramers: ['field-diagnostic-arrhenius', '', ''],
    'stochastic-resonance': ['field-stochastic-resonance', '', '']
  };
  const target = physical[kind];
  if (target) return { container: target[0], select: target[1], kind: target[2], forceRoute: true };
  return {
    container: 'data-driven-research',
    select: 'data-method',
    kind: kind === 'hamiltonian-learning' ? 'hamiltonian' : kind
  };
}
