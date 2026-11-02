import { parseObservedDoublePendulumCsv } from '../../research/experimentalDataImport';
import {
  DEFAULT_OBSERVATION_OPTIONS,
  OBSERVATION_LIMITS,
  type ObservationImportOptions,
  type ObservationMapping
} from './types';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Strict bounded numeric CSV. Formula cells, duplicate/unsafe headers and malformed quotes fail closed. */
export function readObservationCsv(text: string): { headers: string[]; rows: Array<Array<number | null>> } {
  if (new TextEncoder().encode(text).length > OBSERVATION_LIMITS.textBytes)
    throw new Error('관측 CSV는 2 MiB 이하여야 합니다.');
  if (text.includes('\0') || /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))
    throw new Error('CSV에 지원하지 않는 제어 문자가 있습니다.');
  const lines = text.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u);
  while (lines.at(-1) === '') lines.pop();
  if (lines.length < 3 || lines.length > OBSERVATION_LIMITS.rows + 1)
    throw new Error('관측 CSV는 헤더와 2~4096개 데이터 행이 필요합니다.');
  const cells = (line: string): string[] => {
    const result: string[] = [];
    let start = 0;
    let quoted = false;
    for (let i = 0; i <= line.length; i += 1) {
      if (line[i] === '"') {
        if (i !== start && line[i + 1] !== ',' && i !== line.length - 1)
          throw new Error('CSV의 따옴표 형식이 잘못되었습니다.');
        quoted = !quoted;
      }
      if ((line[i] === ',' && !quoted) || i === line.length) {
        let cell = line.slice(start, i).trim();
        if (cell.startsWith('"') && cell.endsWith('"')) cell = cell.slice(1, -1).trim();
        if (cell.includes('"')) throw new Error('CSV의 셀에 잘못된 따옴표가 있습니다.');
        result.push(cell);
        start = i + 1;
      }
    }
    if (quoted || result.length > OBSERVATION_LIMITS.columns)
      throw new Error('CSV 따옴표 또는 최대 16개 열 제한을 확인하세요.');
    return result;
  };
  const headers = cells(lines[0]!);
  if (
    headers.length < 2 ||
    headers.some((v) => !/^[A-Za-z][A-Za-z0-9_]{0,47}$/u.test(v) || forbidden.has(v)) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('열 이름은 고유한 영문 식별자여야 하며 위험한 속성 이름은 사용할 수 없습니다.');
  const rows = lines.slice(1).map((line, row) => {
    const values = cells(line);
    if (values.length !== headers.length) throw new Error(`CSV ${row + 2}행의 열 개수가 다릅니다.`);
    return values.map((cell) => {
      if (cell === '' || /^(?:NA|null)$/iu.test(cell)) return null;
      if (!decimal.test(cell)) throw new Error(`CSV ${row + 2}행에 숫자가 아닌 값 또는 수식이 있습니다.`);
      const value = Number(cell);
      if (!Number.isFinite(value) || Math.abs(value) > 1e12)
        throw new Error(`CSV ${row + 2}행 숫자는 유한하며 절댓값 1e12 이하여야 합니다.`);
      return value === 0 ? 0 : value;
    });
  });
  return { headers, rows };
}

export function observationOptions(partial: Partial<ObservationImportOptions> = {}): ObservationImportOptions {
  const options = { ...DEFAULT_OBSERVATION_OPTIONS, ...partial };
  if (Object.keys(partial).some((key) => !Object.hasOwn(DEFAULT_OBSERVATION_OPTIONS, key)))
    throw new Error('알 수 없는 관측 변환 설정입니다.');
  if (
    !['s', 'ms'].includes(options.timeUnit) ||
    !['rad', 'deg'].includes(options.angleUnit) ||
    !['reject', 'drop', 'interpolate'].includes(options.missing) ||
    !['px', 'm', 'cm'].includes(options.coordinateUnit) ||
    !['down', 'up'].includes(options.yAxis)
  )
    throw new Error('시간·각도·좌표 단위 또는 결측값 정책이 잘못되었습니다.');
  if (
    !(options.timeScale > 0 && options.timeScale <= 1e6) ||
    !Number.isFinite(options.timeOffset) ||
    Math.abs(options.timeOffset) > 1e9 ||
    !(options.maxGapSeconds > 0 && options.maxGapSeconds <= 3600) ||
    !(options.pixelsPerMeter > 0 && options.pixelsPerMeter <= 1e9)
  )
    throw new Error('시간 보정·결측 간격·픽셀 교정값 범위를 확인하세요.');
  for (const values of [options.angleScale, options.angleOffset]) {
    if (!Array.isArray(values) || values.length !== 2 || values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
      throw new Error('각도 보정은 유한한 두 성분이 필요합니다.');
  }
  if (options.angleScale.some((value) => value === 0)) throw new Error('각도 배율은 0일 수 없습니다.');
  if (
    Object.keys(options.pivot).sort().join() !== 'x,y' ||
    !Number.isFinite(options.pivot.x) ||
    !Number.isFinite(options.pivot.y)
  )
    throw new Error('영상 원점 좌표가 잘못되었습니다.');
  return JSON.parse(JSON.stringify(options)) as ObservationImportOptions;
}

export function transformObservationCsv(text: string, mapping: ObservationMapping, options: ObservationImportOptions) {
  const { headers, rows } = readObservationCsv(text);
  const angular = 'theta1' in mapping;
  const keys = angular
    ? 'theta2' in mapping
      ? ['time', 'theta1', 'theta2']
      : ['time', 'theta1']
    : ['time', 'x1', 'y1', 'x2', 'y2'];
  if (Object.keys(mapping).sort().join() !== [...keys].sort().join()) throw new Error('관측 열 매핑을 확인하세요.');
  const names = keys.map((key) => (mapping as unknown as Record<string, string>)[key]!);
  if (new Set(names).size !== names.length || names.some((name) => !headers.includes(name)))
    throw new Error('관측 열 매핑은 실제 존재하는 서로 다른 열이어야 합니다.');
  const indices = names.map((name) => headers.indexOf(name));
  const raw = rows.map((row) => indices.map((i) => row[i]!));
  const times = raw.map((row) => {
    if (row[0] === null) throw new Error('시간 결측값은 보간하지 않습니다.');
    const time = row[0]! * (options.timeUnit === 'ms' ? 0.001 : 1) * options.timeScale + options.timeOffset;
    if (!Number.isFinite(time) || time < 0 || time > 1e9) throw new Error('보정된 시간은 0 이상 유한값이어야 합니다.');
    return time === 0 ? 0 : time;
  });
  if (times.some((time, i) => i > 0 && !(time > times[i - 1]!)))
    throw new Error('시간은 중복 없이 엄격히 증가해야 합니다. 자동 정렬하지 않습니다.');
  if (times.at(-1)! - times[0]! > OBSERVATION_LIMITS.durationSeconds)
    throw new Error('관측 시간 범위는 3600초 이하여야 합니다.');
  let interpolatedValues = 0;
  if (options.missing === 'interpolate') {
    for (let col = 1; col < keys.length; col += 1) {
      for (let row = 0; row < raw.length; row += 1) {
        if (raw[row]![col] !== null) continue;
        let end = row + 1;
        while (end < raw.length && raw[end]![col] === null) end += 1;
        if (row === 0 || end === raw.length) throw new Error('끝점 결측값은 외삽하지 않습니다.');
        const start = row - 1;
        const gap = times[end]! - times[start]!;
        if (gap > options.maxGapSeconds) throw new Error('결측 간격이 허용 범위를 초과했습니다.');
        for (let index = row; index < end; index += 1) {
          const fraction = (times[index]! - times[start]!) / gap;
          raw[index]![col] = raw[start]![col]! * (1 - fraction) + raw[end]![col]! * fraction;
          interpolatedValues += 1;
        }
        row = end;
      }
    }
  }
  let droppedRows = 0;
  const acceptedTimes: number[] = [];
  const accepted: number[][] = [];
  raw.forEach((row, index) => {
    if (row.slice(1).some((value) => value === null)) {
      if (options.missing === 'reject')
        throw new Error('결측값이 있습니다. 삭제 또는 제한된 선형 보간 정책을 선택하세요.');
      droppedRows += 1;
      return;
    }
    acceptedTimes.push(times[index]!);
    accepted.push(row.slice(1) as number[]);
  });
  if (accepted.length < 2) throw new Error('변환 후 최소 2개 표본이 필요합니다.');
  let angles: number[][];
  if (angular) {
    if (keys.length === 3) {
      const sanitized = [
        'time,theta1,theta2',
        ...accepted.map((values, i) => `${acceptedTimes[i]},${values[0]},${values[1]}`)
      ].join('\n');
      angles = parseObservedDoublePendulumCsv(sanitized, {
        angleUnit: options.angleUnit === 'deg' ? 'degree' : 'radian'
      }).angles.map((value) => [...value]);
    } else {
      angles = accepted.map((values) => [values[0]! * (options.angleUnit === 'deg' ? Math.PI / 180 : 1)]);
    }
  } else {
    const factor =
      options.coordinateUnit === 'px' ? 1 / options.pixelsPerMeter : options.coordinateUnit === 'cm' ? 0.01 : 1;
    for (const values of accepted) {
      if (
        Math.hypot(values[0]! - options.pivot.x, values[1]! - options.pivot.y) === 0 ||
        Math.hypot(values[2]! - values[0]!, values[3]! - values[1]!) === 0
      )
        throw new Error('겹친 마커 또는 원점과 겹친 첫 마커는 각도를 정의할 수 없습니다.');
    }
    const sanitized = [
      'time,x1,y1,x2,y2',
      ...accepted.map((values, i) => `${acceptedTimes[i]},${values.map((v) => v * factor).join(',')}`)
    ].join('\n');
    angles = parseObservedDoublePendulumCsv(sanitized, {
      pivot: { x: options.pivot.x * factor, y: options.pivot.y * factor },
      yAxis: options.yAxis
    }).angles.map((value) => [...value]);
  }
  angles = angles.map((values) =>
    values.map((value, col) => {
      const calibrated = value * options.angleScale[col]! + options.angleOffset[col]!;
      if (!Number.isFinite(calibrated) || Math.abs(calibrated) > 1e9)
        throw new Error('보정된 각도가 유효 범위를 초과합니다.');
      return calibrated === 0 ? 0 : calibrated;
    })
  );
  return { times: acceptedTimes, angles, sourceRows: rows.length, droppedRows, interpolatedValues };
}
