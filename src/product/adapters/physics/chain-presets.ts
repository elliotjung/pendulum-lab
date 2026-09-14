import { EXPANSION_MODEL_DEFINITIONS, EXPANSION_PRESETS } from '../../../physics/expandedModels-factory';
import { defaultChainConfig, validateChainConfig, type ChainConfig, type ChainSystemId } from './chain';

/** Reads the legacy preset data without changing its source or the legacy study settings. */
export function chainPresets(systemId: ChainSystemId): readonly { id: string; label: string; config: ChainConfig }[] {
  const presets = [{ id: 'default', label: '기본 설정', config: defaultChainConfig(systemId) }];
  if (systemId !== 'system:chain') return presets;
  const definition = EXPANSION_MODEL_DEFINITIONS.find((item) => item.id === 'chain')!;
  const preset = EXPANSION_PRESETS.find((item) => item.id === 'chain-cascade')!;
  const parameters = { ...definition.defaultParameters, ...preset.config.parameterOverrides };
  const n = parameters.links!;
  const checked = validateChainConfig({
    ...defaultChainConfig(systemId, n),
    parameters: {
      masses: Array.from({ length: n }, (_, i) => parameters[`mass${i + 1}`]),
      lengths: Array.from({ length: n }, (_, i) => parameters[`length${i + 1}`]),
      g: parameters.g
    },
    gamma: parameters.damping,
    initialState: [...(preset.config.initialState ?? definition.defaultState)],
    step: preset.config.dt ?? definition.defaultDt,
    duration: preset.config.horizon ?? definition.defaultHorizon
  });
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  presets.push({ id: preset.id, label: '기존 프리셋 · 4링크 cascade', config: checked.value });
  return presets;
}
