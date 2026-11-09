import { validateQuantityValue, type CanonicalUnit, type QuantityValue } from '../contracts/quantities';
import { createInput, type InputControl } from './primitives';
import {
  displayQuantityValue,
  isAngularUnit,
  parseDisplayQuantityInput,
  type AngleDisplayUnit
} from './display-quantity';

export interface QuantityRange {
  readonly unit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
}

type ScalarQuantity = Extract<QuantityValue, { kind: 'scalar' }>;
export type QuantityInputResult =
  | { readonly ok: true; readonly quantity: ScalarQuantity }
  | { readonly ok: false; readonly code: 'empty' | 'number' | 'range' | 'configuration'; readonly message: string };

/** Parse only decimal/scientific notation, without rounding, clamping or empty-to-zero coercion. */
export function parseQuantityInput(text: string, range: QuantityRange): QuantityInputResult {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    return { ok: false, code: 'configuration', message: '입력 범위가 올바르지 않습니다.' };
  }
  const source = text.trim();
  if (!source) return { ok: false, code: 'empty', message: '값을 입력해 주세요.' };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source)) {
    return { ok: false, code: 'number', message: '유한한 숫자를 입력해 주세요. 예: 1.5 또는 1e-3' };
  }
  const value = Number(source);
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return { ok: false, code: 'number', message: '유한한 숫자를 입력해 주세요. 음의 0은 지원하지 않습니다.' };
  }
  if (value === 0 && /[1-9]/.test(source.split(/[eE]/, 1)[0] ?? '')) {
    return { ok: false, code: 'number', message: '값이 너무 작아 표현할 수 없습니다. 단위와 크기를 확인해 주세요.' };
  }
  if (value < range.min || value > range.max) {
    return {
      ok: false,
      code: 'range',
      message: `${range.min} 이상 ${range.max} 이하 ${range.unit} 값을 입력해 주세요.`
    };
  }
  const quantity: ScalarQuantity = { kind: 'scalar', value, unit: range.unit };
  const result = validateQuantityValue(quantity);
  return result.ok
    ? { ok: true, quantity }
    : { ok: false, code: 'configuration', message: '지원하는 SI 단위인지 확인해 주세요.' };
}

export interface QuantityOptions extends QuantityRange {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly meaning: string;
  readonly defaultValue: number;
  readonly value?: number;
  readonly disabled?: boolean;
  readonly onChange?: (result: QuantityInputResult) => void;
}

export interface QuantityControl extends InputControl {
  read(): QuantityInputResult;
  setValue(value: number): void;
  setDisplayUnit(unit: AngleDisplayUnit): void;
}

function checkedValue(value: number, range: QuantityRange): QuantityInputResult & { readonly ok: true } {
  // String(-0) loses its sign; reject before serializing to the visible control.
  const parsed = parseQuantityInput(Object.is(value, -0) ? '-0' : String(value), range);
  if (!parsed.ok) throw new RangeError(parsed.message);
  return parsed;
}

/** Canonical SI values remain independent of the precision/display-unit editor. */
export function createQuantity(document: Document, options: QuantityOptions): QuantityControl {
  checkedValue(options.defaultValue, options);
  const initial = checkedValue(options.value ?? options.defaultValue, options);
  let displayUnit: AngleDisplayUnit = document.documentElement.dataset.productAngleUnit === 'deg' ? 'deg' : 'rad';
  let canonicalValue = initial.quantity.value;
  let displayedText = displayQuantityValue(canonicalValue, options.unit, displayUnit);
  const field = createInput(document, {
    id: options.id,
    label: `${options.label} · ${options.symbol} (${isAngularUnit(options.unit) && displayUnit === 'deg' ? (options.unit === 'rad/s' ? 'deg/s' : 'deg') : options.unit})`,
    value: displayedText,
    help: `${options.meaning} 범위: ${options.min}–${options.max} ${options.unit}. 기본값: ${options.defaultValue} ${options.unit}.`,
    required: true,
    disabled: options.disabled ?? false,
    onInput() {
      const parsed = read();
      options.onChange?.(parsed);
    }
  });
  field.element.classList.add('ds-quantity');
  field.input.inputMode = 'decimal';
  field.input.autocomplete = 'off';
  field.element.querySelector('.ds-field__help')?.classList.add('ds-quantity__meta');
  const angular = isAngularUnit(options.unit);
  const unitControl = document.createElement('select');
  if (angular) {
    unitControl.id = `${options.id}-display-unit`;
    unitControl.className = 'ds-field__control';
    unitControl.setAttribute('aria-label', `표시 단위 · ${options.symbol}`);
    unitControl.disabled = options.disabled ?? false;
    for (const unit of ['rad', 'deg'] as const) {
      const option = document.createElement('option');
      option.value = unit;
      option.textContent = options.unit === 'rad/s' ? `${unit}/s` : unit;
      unitControl.append(option);
    }
    unitControl.value = displayUnit;
    unitControl.addEventListener('change', () => setDisplayUnit(unitControl.value === 'deg' ? 'deg' : 'rad'));
    field.element.append(unitControl);
  }

  function read(): QuantityInputResult {
    const parsed =
      field.input.value === displayedText
        ? checkedValue(canonicalValue, options)
        : parseDisplayQuantityInput(field.input.value, options, displayUnit);
    field.setError(parsed.ok ? '' : parsed.message);
    if (parsed.ok) {
      canonicalValue = parsed.quantity.value;
      displayedText = field.input.value;
    }
    return parsed;
  }
  function setDisplayUnit(unit: AngleDisplayUnit): void {
    if (!angular || unit === displayUnit) return;
    const parsed = read();
    if (!parsed.ok) {
      unitControl.value = displayUnit;
      return;
    }
    try {
      displayedText = displayQuantityValue(canonicalValue, options.unit, unit);
    } catch {
      unitControl.value = displayUnit;
      field.setError('이 단위로 유한하게 표시할 수 없습니다. 원래 값과 단위를 유지합니다.');
      return;
    }
    displayUnit = unit;
    unitControl.value = unit;
    field.input.value = displayedText;
    const label = field.element.querySelector('label');
    if (label)
      label.textContent = `${options.label} · ${options.symbol} (${options.unit === 'rad/s' ? `${unit}/s` : unit})`;
    field.setError('');
  }

  return {
    ...field,
    read,
    setValue(value) {
      const parsed = checkedValue(value, options);
      canonicalValue = parsed.quantity.value;
      displayedText = displayQuantityValue(canonicalValue, options.unit, displayUnit);
      field.input.value = displayedText;
      field.setError('');
    },
    setDisplayUnit
  };
}
