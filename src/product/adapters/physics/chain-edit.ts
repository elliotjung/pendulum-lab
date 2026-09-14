import {
  validateChainConfig,
  ChainConfigurationError,
  MAX_CHAIN_LINKS,
  type ChainConfig,
  type ChainBulkField
} from './chain';
function checked(value: ChainConfig): ChainConfig {
  const result = validateChainConfig(value);
  if (!result.ok) throw new ChainConfigurationError(result.issues);
  return result.value;
}
/** Insert/remove the matching entries in both state halves; callers never mutate the source. */
export function addChainLink(input: ChainConfig, index = input.parameters.masses.length): ChainConfig {
  const config = checked(input),
    n = config.parameters.masses.length;
  if (config.systemId !== 'system:chain' || n >= MAX_CHAIN_LINKS || !Number.isInteger(index) || index < 0 || index > n)
    throw new RangeError('사슬의 유효한 위치에만 최대 128개까지 링크를 추가할 수 있습니다.');
  const masses = [...config.parameters.masses],
    lengths = [...config.parameters.lengths];
  const theta = config.initialState.slice(0, n),
    omega = config.initialState.slice(n);
  masses.splice(index, 0, 1);
  lengths.splice(index, 0, 1);
  theta.splice(index, 0, 0);
  omega.splice(index, 0, 0);
  return checked({
    ...config,
    parameters: { ...config.parameters, masses, lengths },
    initialState: [...theta, ...omega]
  });
}
export function removeChainLink(input: ChainConfig, index: number): ChainConfig {
  const config = checked(input),
    n = config.parameters.masses.length;
  if (config.systemId !== 'system:chain' || n <= 1 || !Number.isInteger(index) || index < 0 || index >= n)
    throw new RangeError('사슬에는 최소 1개 링크가 필요하며 유효한 링크만 삭제할 수 있습니다.');
  const masses = [...config.parameters.masses],
    lengths = [...config.parameters.lengths];
  const theta = config.initialState.slice(0, n),
    omega = config.initialState.slice(n);
  for (const values of [masses, lengths, theta, omega]) values.splice(index, 1);
  return checked({
    ...config,
    parameters: { ...config.parameters, masses, lengths },
    initialState: [...theta, ...omega]
  });
}
export function bulkChainLinks(input: ChainConfig, field: ChainBulkField, value: number): ChainConfig {
  const config = checked(input),
    n = config.parameters.masses.length;
  if (!['mass', 'length', 'theta', 'omega'].includes(field))
    throw new RangeError('지원하지 않는 일괄 편집 항목입니다.');
  const values = Array<number>(n).fill(value);
  return checked(
    field === 'mass' || field === 'length'
      ? { ...config, parameters: { ...config.parameters, [field === 'mass' ? 'masses' : 'lengths']: values } }
      : {
          ...config,
          initialState:
            field === 'theta'
              ? [...values, ...config.initialState.slice(n)]
              : [...config.initialState.slice(0, n), ...values]
        }
  );
}

export function resizeChainLinks(input: ChainConfig, n: number): ChainConfig {
  const config = checked(input),
    previous = config.parameters.masses.length;
  if (config.systemId !== 'system:chain' || !Number.isInteger(n) || n < 1 || n > MAX_CHAIN_LINKS)
    throw new RangeError('사슬 링크 수는 1–128 정수여야 합니다.');
  const resize = (values: readonly number[], fallback: number) =>
    Array.from({ length: n }, (_, i) => values[i] ?? fallback);
  return checked({
    ...config,
    parameters: {
      ...config.parameters,
      masses: resize(config.parameters.masses, 1),
      lengths: resize(config.parameters.lengths, 1)
    },
    initialState: [
      ...resize(config.initialState.slice(0, previous), 0),
      ...resize(config.initialState.slice(previous), 0)
    ]
  });
}
