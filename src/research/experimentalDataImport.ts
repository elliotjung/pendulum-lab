import type { LevenbergMarquardtOptions } from './parameterEstimation';
import {
  fitDoublePendulum,
  type DoublePendulumFitResult,
  type DoublePendulumFitSpec,
  type DoublePendulumObservation
} from './parameterEstimation';

export interface ExperimentalCsvImportOptions {
  angleUnit?: 'radian' | 'degree';
  yAxis?: 'down' | 'up';
  pivot?: { x: number; y: number };
}

type RecordRow = Record<string, string>;

const TIME_KEYS = ['time', 't', 'seconds', 'sec'];
const THETA1_KEYS = ['theta1', 'theta_1', 'th1', 'angle1', 'angle_1'];
const THETA2_KEYS = ['theta2', 'theta_2', 'th2', 'angle2', 'angle_2'];
const X1_KEYS = ['x1', 'bob1_x', 'mass1_x'];
const Y1_KEYS = ['y1', 'bob1_y', 'mass1_y'];
const X2_KEYS = ['x2', 'bob2_x', 'mass2_x'];
const Y2_KEYS = ['y2', 'bob2_y', 'mass2_y'];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function parseRows(text: string): RecordRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (lines.length < 2) throw new Error('parseObservedDoublePendulumCsv: CSV needs a header and at least one row.');
  const headers = splitCsvLine(lines[0]!).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: RecordRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function pick(row: RecordRow, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function readNumber(row: RecordRow, keys: readonly string[], label: string): number {
  const raw = pick(row, keys);
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`parseObservedDoublePendulumCsv: missing or invalid ${label}.`);
  return value;
}

function toRadians(value: number, unit: 'radian' | 'degree'): number {
  return unit === 'degree' ? (value * Math.PI) / 180 : value;
}

function positionAngles(row: RecordRow, options: ExperimentalCsvImportOptions): [number, number] {
  const pivot = options.pivot ?? { x: 0, y: 0 };
  const ySign = options.yAxis === 'up' ? -1 : 1;
  const x1 = readNumber(row, X1_KEYS, 'x1');
  const y1 = readNumber(row, Y1_KEYS, 'y1');
  const x2 = readNumber(row, X2_KEYS, 'x2');
  const y2 = readNumber(row, Y2_KEYS, 'y2');
  const theta1 = Math.atan2(x1 - pivot.x, ySign * (y1 - pivot.y));
  const theta2 = Math.atan2(x2 - x1, ySign * (y2 - y1));
  return [theta1, theta2];
}

function hasAngleColumns(row: RecordRow): boolean {
  return pick(row, THETA1_KEYS) !== undefined && pick(row, THETA2_KEYS) !== undefined;
}

export function parseObservedDoublePendulumCsv(
  text: string,
  options: ExperimentalCsvImportOptions = {}
): DoublePendulumObservation {
  const rows = parseRows(text);
  const unit = options.angleUnit ?? 'radian';
  const times: number[] = [];
  const angles: Array<[number, number]> = [];
  for (const row of rows) {
    times.push(readNumber(row, TIME_KEYS, 'time'));
    if (hasAngleColumns(row)) {
      angles.push([
        toRadians(readNumber(row, THETA1_KEYS, 'theta1'), unit),
        toRadians(readNumber(row, THETA2_KEYS, 'theta2'), unit)
      ]);
    } else {
      angles.push(positionAngles(row, options));
    }
  }
  for (let i = 1; i < times.length; i += 1) {
    if (!(times[i]! > times[i - 1]!))
      throw new Error('parseObservedDoublePendulumCsv: time column must be strictly increasing.');
  }
  return { times, angles };
}

export function fitDoublePendulumFromCsv(
  text: string,
  spec: DoublePendulumFitSpec,
  importOptions: ExperimentalCsvImportOptions = {},
  fitOptions: LevenbergMarquardtOptions = {}
): DoublePendulumFitResult {
  return fitDoublePendulum(parseObservedDoublePendulumCsv(text, importOptions), spec, fitOptions);
}
