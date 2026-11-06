import { element } from '../../app/dom';
import { createQuantity } from '../../design-system/quantity';
import {
  ODE_TOLERANCE_MIN,
  ODE_TOLERANCE_MAX,
  type LegacyOdeIntegratorId
} from '../../adapters/physics/planar-integrators';

/** Opt-in preserves the omitted setting and each method's legacy defaults. */
export function createOdeToleranceControl(document: Document, id: string, onChange: () => void) {
  const group = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label');
  const enabled = element(document, 'input', '');
  enabled.type = 'checkbox';
  enabled.id = `${id}-enabled`;
  label.append(enabled, document.createTextNode(' 잔차 허용오차 직접 지정'));
  const quantity = createQuantity(document, {
    id,
    label: '잔차 허용오차',
    symbol: 'tol',
    unit: '1',
    min: ODE_TOLERANCE_MIN,
    max: ODE_TOLERANCE_MAX,
    defaultValue: 1e-10,
    value: 1e-10,
    meaning:
      '암시적 잔차의 수렴 기준입니다. 선택하지 않으면 해당 해법의 기존 기본값을 유지합니다. 명시적·오차 감시 고정 step은 이 값으로 간격을 자동 조절하지 않습니다.',
    onChange
  });
  group.append(label, quantity.element);
  let busy = false;
  const updateDisabled = () => {
    enabled.disabled = busy;
    quantity.input.disabled = busy || !enabled.checked;
  };
  enabled.addEventListener('change', () => {
    updateDisabled();
    onChange();
  });
  return {
    element: group,
    read() {
      if (!enabled.checked) return { ok: true as const, value: undefined };
      const result = quantity.read();
      return result.ok ? { ok: true as const, value: result.quantity.value } : { ok: false as const };
    },
    sync(value: number | undefined, method: LegacyOdeIntegratorId) {
      enabled.checked = value !== undefined;
      quantity.setValue(value ?? (method === 'integrator:gauss2' ? 1e-12 : 1e-10));
      updateDisabled();
    },
    setDisabled(value: boolean) {
      busy = value;
      updateDisabled();
    }
  };
}
