import type { CanonicalUnit } from '../contracts/quantities';
import { parseQuantityInput, type QuantityInputResult, type QuantityRange } from './quantity';

export type AngleDisplayUnit = 'rad' | 'deg';
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const piExpression = /^([+-]?)(?:(\d+(?:\.\d*)?|\.\d+)\s*\*?\s*)?pi(?:\s*\/\s*(\d+(?:\.\d*)?|\.\d+))?$/;
export const isAngularUnit = (unit: CanonicalUnit) => unit === 'rad' || unit === 'rad/s';

/** The native precision grammar, applied to display values before strict SI validation.
 * No JavaScript evaluator, general arithmetic, names or callbacks are accepted.
 */
export function parseDisplayQuantityInput(
  input: string,
  range: QuantityRange,
  displayUnit: AngleDisplayUnit = 'rad'
): QuantityInputResult {
  let text = input.trim().toLowerCase().replaceAll('π', 'pi').replaceAll('−', '-');
  if (!text) return { ok: false, code: 'empty', message: '값을 입력해 주세요.' };
  const angular = isAngularUnit(range.unit);
  const suffix = /\s*(deg|rad|°)(\/s)?$/.exec(text);
  let unit: AngleDisplayUnit | undefined;
  if (suffix) {
    if (!angular || (suffix[2] && range.unit !== 'rad/s'))
      return { ok: false, code: 'number', message: '이 값에 맞는 단위를 입력하세요.' };
    unit = suffix[1] === 'rad' ? 'rad' : 'deg';
    text = text.slice(0, suffix.index).trim();
  }
  if (!text.includes('.') && (text.match(/,/g)?.length ?? 0) === 1) text = text.replace(',', '.');
  const expression = piExpression.exec(text);
  let numeric: number;
  if (expression) {
    const coefficient = Number(expression[2] ?? 1);
    const denominator = Number(expression[3] ?? 1);
    if (!Number.isFinite(coefficient) || !Number.isFinite(denominator) || denominator === 0)
      return { ok: false, code: 'number', message: 'π의 계수와 분모는 유한하고 분모는 0이 아니어야 합니다.' };
    const checkedCoefficient = parseQuantityInput(expression[2] ?? '1', {
      unit: range.unit,
      min: 0,
      max: Number.MAX_VALUE
    });
    if (!checkedCoefficient.ok) return checkedCoefficient;
    numeric = ((expression[1] === '-' ? -1 : 1) * coefficient * Math.PI) / denominator;
    if (angular) unit ??= 'rad';
  } else {
    if (!decimal.test(text))
      return { ok: false, code: 'number', message: '숫자·과학 표기 또는 pi/2 같은 π 표현을 입력하세요.' };
    // Preserve the strict decimal reader's underflow/negative-zero checks.
    const numericCheck = parseQuantityInput(text, { unit: range.unit, min: -Number.MAX_VALUE, max: Number.MAX_VALUE });
    if (!numericCheck.ok) return numericCheck;
    numeric = numericCheck.quantity.value;
  }
  const value = angular && (unit ?? displayUnit) === 'deg' ? (numeric * Math.PI) / 180 : numeric;
  if (numeric !== 0 && value === 0)
    return { ok: false, code: 'number', message: '단위 변환 뒤 값을 유한 정밀도로 보존할 수 없습니다.' };
  return parseQuantityInput(Object.is(value, -0) ? '-0' : String(value), range);
}

/** Display conversion is never written back into the canonical value on a unit change. */
export function displayQuantityValue(value: number, unit: CanonicalUnit, display: AngleDisplayUnit): string {
  const shown = isAngularUnit(unit) && display === 'deg' ? (value * 180) / Math.PI : value;
  if (!Number.isFinite(shown)) throw new RangeError('Display conversion exceeds finite precision.');
  return String(shown);
}
