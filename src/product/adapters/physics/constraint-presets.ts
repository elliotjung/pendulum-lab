import {
  defaultConstraintConfig,
  validateConstraintConfig,
  type ConstraintConfig,
  type ConstraintSystemId
} from './constraint';

/** Restart examples use the same original engines as arbitrary user settings. */
export function constraintPresets(
  systemId: ConstraintSystemId
): readonly { id: string; label: string; config: ConstraintConfig }[] {
  const base = defaultConstraintConfig(systemId);
  const definitions =
    systemId === 'system:spring'
      ? [
          { id: 'spring-radial', label: '방사 방향 진동', initialState: [1.44525, 0, 0, 0] },
          { id: 'spring-compression', label: '압축된 용수철', initialState: [0.9, 0.1, 0, 0] }
        ]
      : systemId === 'system:rope'
        ? [
            { id: 'rope-release', label: '초기 이완과 재포획', initialState: [2.5, 0] },
            { id: 'rope-zero-crossing', label: '장력 0 교차', initialState: [0, 6] }
          ]
        : [
            { id: 'double-outer-release', label: '바깥 줄 초기 이완', initialState: [0.2, 2.5, 0, 0] },
            { id: 'double-full-release', label: '두 줄 자유 비행', initialState: [2.5, 2.5, 0, 0] }
          ];
  return [
    { id: 'default', label: '기본 설정', config: base },
    ...definitions.map(({ id, label, initialState }) => {
      const checked = validateConstraintConfig({
        ...base,
        initialState,
        duration: systemId === 'system:spring' ? 8 : 2,
        provenance: { createdByVersion: 's11-presets-v1', source: { kind: 'preset', id }, parentExperimentIds: [] }
      });
      if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
      return { id, label, config: checked.value };
    })
  ];
}
