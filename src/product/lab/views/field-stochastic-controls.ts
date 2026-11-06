import { element } from '../../app/dom';
import { createInput } from '../../design-system/primitives';
import { parseContractJson } from '../../persistence/json';
import {
  FIELD_STOCHASTIC_SCHEMES,
  validateFieldStochastic,
  type FieldStochasticOptions
} from '../../adapters/physics/field-stochastic';
import type { ContractIssue } from '../../contracts/validation';

export function createFieldStochasticControls(document: Document, edited: () => void) {
  const details = element(document, 'details', 'lab-details');
  details.append(element(document, 'summary', '', '확률 scheme·곱셈 잡음·확산 행렬'));
  details.append(
    element(
      document,
      'p',
      'lab-muted',
      '단위 1인 정규화 계수입니다. Bᵢ=σ(offsetᵢ+slopeᵢxᵢ), 행렬은 이 값에 Mᵢₖ를 곱합니다. θ/ω 순서와 두 Brownian 채널을 사용합니다. Stratonovich 선택은 같은 drift의 Itô 모델과 다른 해석입니다.'
    )
  );
  const label = element(document, 'label', 'ds-field__label', '확률 적분 scheme');
  const scheme = element(document, 'select', 'ds-field__control');
  scheme.id = 'field-stochastic-scheme';
  label.htmlFor = scheme.id;
  for (const [value, text] of [
    ['legacy-additive', '기존 가산 속도 잡음 Euler–Maruyama'],
    ...FIELD_STOCHASTIC_SCHEMES.map((id) => [id, id === 'heun-stratonovich' ? `${id} (Stratonovich)` : `${id} (Itô)`])
  ]) {
    const option = element(document, 'option', '', text!);
    option.value = value!;
    scheme.append(option);
  }
  const offset = createInput(document, {
    id: 'field-diffusion-offset',
    label: '확산 offset [θ, ω]',
    value: '[0,1]',
    help: '−10–10의 숫자 2개, JSON 배열'
  });
  const slope = createInput(document, {
    id: 'field-diffusion-slope',
    label: '자기 성분 확산 slope [θ, ω]',
    value: '[0,0.2]',
    help: '정확한 확산 도함수에 함께 사용합니다.'
  });
  const matrix = createInput(document, {
    id: 'field-diffusion-matrix',
    label: '확산 M [M00,M01,M10,M11]',
    value: '[1,0.25,0.3,1]',
    help: '2×2 행 우선 JSON 배열, 원소 −10–10. 행마다 자기 성분의 affine 계수가 곱해져 noise commutativity를 보존합니다.'
  });
  details.append(label, scheme, offset.element, slope.element, matrix.element);
  function visibility() {
    const explicit = scheme.value !== 'legacy-additive';
    offset.element.hidden = !explicit;
    slope.element.hidden = !explicit;
    matrix.element.hidden = !['heun-stratonovich', 'commutative-milstein'].includes(scheme.value);
  }
  scheme.addEventListener('change', () => {
    visibility();
    edited();
  });
  for (const control of [offset, slope, matrix]) control.input.addEventListener('input', edited);
  function vector(value: string): readonly number[] {
    const parsed = parseContractJson(value);
    if (!parsed.ok || !Array.isArray(parsed.value) || !parsed.value.every((entry) => typeof entry === 'number'))
      throw new Error('확산 계수는 유한 숫자의 JSON 배열이어야 합니다.');
    return parsed.value as number[];
  }
  return {
    element: details,
    read(): FieldStochasticOptions | undefined {
      if (scheme.value === 'legacy-additive') return;
      const result = {
        scheme: scheme.value,
        offset: vector(offset.input.value),
        slope: vector(slope.input.value),
        ...(['heun-stratonovich', 'commutative-milstein'].includes(scheme.value)
          ? { matrix: vector(matrix.input.value) }
          : {})
      };
      const issues: ContractIssue[] = [];
      validateFieldStochastic(result, 'system:langevin', issues);
      if (issues.length) throw new Error(issues.map((entry) => entry.message).join(' '));
      return result as FieldStochasticOptions;
    },
    sync(value: FieldStochasticOptions | undefined) {
      scheme.value = value?.scheme ?? 'legacy-additive';
      offset.input.value = JSON.stringify(value?.offset ?? [0, 1]);
      slope.input.value = JSON.stringify(value?.slope ?? [0, 0.2]);
      matrix.input.value = JSON.stringify(value && 'matrix' in value ? value.matrix : [1, 0.25, 0.3, 1]);
      visibility();
    }
  };
}
