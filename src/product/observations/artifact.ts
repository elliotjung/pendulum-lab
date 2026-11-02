import { sha256Hex } from '../../research/zipBundle';
import type { DoublePendulumObservation } from '../../research/parameterEstimation';
import { observationOptions, transformObservationCsv } from './csv';
import {
  OBSERVATION_LIMITS,
  type ObservationArtifact,
  type ObservationImportRequest,
  type ObservationMedia,
  type ObservationPreview
} from './types';

const previews = new WeakSet<object>();
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
const digest = (value: string) => sha256Hex(encoder.encode(value));
function ordered(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(ordered).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${ordered((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

export function freezeObservationData<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeObservationData(child);
    Object.freeze(value);
  }
  return value;
}

/** Bounded data-only copy, including descriptors to reject getters before evaluating them. */
export function inspectObservationData(input: unknown): unknown {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 120000 || depth > 24) throw new Error('관측 자료 구조가 너무 큽니다.');
    if (typeof value === 'string') {
      bytes += encoder.encode(value).length;
      if (bytes > OBSERVATION_LIMITS.fileBytes) throw new Error('관측 파일은 16 MiB 이하여야 합니다.');
      return value;
    }
    if (value === null || typeof value === 'boolean') {
      bytes += 5;
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      bytes += 24;
      return value === 0 ? 0 : value;
    }
    if (typeof value !== 'object') throw new Error('관측 파일은 유한 JSON 데이터만 지원합니다.');
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('관측 파일에는 일반 객체만 허용됩니다.');
    if (ancestors.has(value)) throw new Error('순환 자료는 지원하지 않습니다.');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length?.value as number) : 0;
    if (array ? length > OBSERVATION_LIMITS.rows * 8 || keys.length !== length + 1 : keys.length > 80)
      throw new Error('관측 파일 객체·배열 제한을 초과했습니다.');
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || forbidden.has(key)) throw new Error('위험한 관측 파일 속성입니다.');
      if (key.length > 128) throw new Error('관측 파일 속성 이름이 너무 깁니다.');
      bytes += encoder.encode(key).length;
      const descriptor = descriptors[key]!;
      if (
        !('value' in descriptor) ||
        !descriptor.enumerable ||
        (array && (!/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length))
      )
        throw new Error('숨김 속성·접근자·희소 배열은 지원하지 않습니다.');
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    ancestors.delete(value);
    return result;
  };
  const result = visit(input, 0);
  if (bytes > OBSERVATION_LIMITS.fileBytes) throw new Error('관측 파일이 너무 큽니다.');
  return result;
}

function validateName(name: string): void {
  if (
    typeof name !== 'string' ||
    name.length < 1 ||
    name.length > 128 ||
    /[\u0000-\u001F\\/:]/u.test(name) ||
    name === '.' ||
    name === '..'
  )
    throw new Error('관측 파일명에는 경로 또는 제어 문자를 사용할 수 없습니다.');
}

async function mediaSnapshot(media: ObservationMedia) {
  validateName(media.name);
  if (
    !['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(media.mime) ||
    typeof media.base64 !== 'string' ||
    media.base64.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/u.test(media.base64) ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(media.base64)
  )
    throw new Error('원본 영상 형식 또는 base64가 잘못되었습니다.');
  const expectedBytes =
    (media.base64.length / 4) * 3 - (media.base64.endsWith('==') ? 2 : media.base64.endsWith('=') ? 1 : 0);
  if (expectedBytes < 1 || expectedBytes > OBSERVATION_LIMITS.mediaBytes)
    throw new Error('원본 영상은 8 MiB 이하여야 합니다.');
  const bytes = Uint8Array.from(atob(media.base64), (c) => c.charCodeAt(0));
  const marker = new TextDecoder().decode(
    bytes.subarray(media.mime === 'video/ogg' ? 0 : 4, media.mime === 'video/ogg' ? 4 : 8)
  );
  const signature =
    media.mime === 'video/webm'
      ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
      : media.mime === 'video/ogg'
        ? marker === 'OggS'
        : marker === 'ftyp';
  if (!signature) throw new Error('원본 영상의 실제 파일 서명이 MIME 형식과 다릅니다.');
  return { ...media, sha256: await sha256Hex(bytes) };
}

export async function previewObservationImport(request: ObservationImportRequest): Promise<ObservationPreview> {
  const input = inspectObservationData(request) as ObservationImportRequest;
  if (
    Object.keys(input).some((key) => !['text', 'name', 'kind', 'mapping', 'options', 'media', 'capture'].includes(key))
  )
    throw new Error('알 수 없는 관측 가져오기 필드입니다.');
  validateName(input.name);
  if (!['csv', 'sensor', 'video'].includes(input.kind) || typeof input.text !== 'string')
    throw new Error('관측 원본 형식이 잘못되었습니다.');
  if (input.media && input.kind !== 'video') throw new Error('영상 원본은 video 관측에만 연결할 수 있습니다.');
  if (input.kind === 'video' && (!input.media || !input.capture))
    throw new Error('영상 관측에는 원본 영상과 추적 설정이 필요합니다.');
  if (input.capture && (Object.keys(input.capture).length > 24 || JSON.stringify(input.capture).length > 8192))
    throw new Error('촬영 메타데이터가 너무 큽니다.');
  const options = observationOptions(input.options);
  const transformed = transformObservationCsv(input.text, input.mapping, options);
  const media = input.media ? await mediaSnapshot(input.media) : undefined;
  const sha256 = await digest(input.text);
  const originalIdentity = {
    name: input.name,
    kind: input.kind,
    sha256,
    media: media?.sha256 ?? null,
    capture: input.capture ?? null
  };
  const originalId = `observation-source-${await digest(ordered(originalIdentity))}`;
  const transformId = `observation-transform-${await digest(ordered({ originalId, mapping: input.mapping, options }))}`;
  const warnings = [
    '가져온 원본과 계산 결과는 실험자가 제공한 자료이며 진위가 인증된 것은 아닙니다.',
    ...(transformed.droppedRows
      ? [`결측값이 있는 ${transformed.droppedRows}개 행을 명시적 정책으로 제외했습니다.`]
      : []),
    ...(transformed.interpolatedValues
      ? [`${transformed.interpolatedValues}개 값을 시간에 따라 선형 보간했습니다. 각도 래핑 경계는 먼저 풀어야 합니다.`]
      : []),
    ...(transformed.angles[0]!.length === 1
      ? ['단일 센서 각도는 보존되지만 이중진자 매개변수 추정에는 두 각도 채널이 필요합니다.']
      : [])
  ];
  const artifact: ObservationArtifact = {
    schema: 'pendulum-observation/v1',
    id: `observation-${transformId.slice('observation-transform-'.length)}`,
    original: {
      id: originalId,
      name: input.name,
      kind: input.kind,
      text: input.text,
      sha256,
      ...(media ? { media } : {}),
      ...(input.capture ? { capture: input.capture } : {})
    },
    transform: {
      id: transformId,
      mapping: input.mapping,
      options,
      history: [
        `column-map:${ordered(input.mapping)}`,
        `time:${options.timeUnit}->s;scale=${options.timeScale};offset=${options.timeOffset}`,
        `angles:${'theta1' in input.mapping ? options.angleUnit : `${options.coordinateUnit};pivot=${ordered(options.pivot)};y=${options.yAxis};px/m=${options.pixelsPerMeter}`}->rad;scale=${options.angleScale.join(',')};offset=${options.angleOffset.join(',')}`,
        `missing:${options.missing};max-gap=${options.maxGapSeconds}s`
      ],
      sourceRows: transformed.sourceRows,
      droppedRows: transformed.droppedRows,
      interpolatedValues: transformed.interpolatedValues
    },
    data: { times: transformed.times, angles: transformed.angles, timeUnit: 's', angleUnit: 'rad' },
    warnings
  };
  const preview = freezeObservationData<ObservationPreview>({
    stage: 'preview',
    artifact,
    summary: {
      sourceRows: transformed.sourceRows,
      acceptedRows: transformed.times.length,
      channels: transformed.angles[0]!.length,
      durationSeconds: transformed.times.at(-1)! - transformed.times[0]!
    }
  });
  previews.add(preview);
  return preview;
}

/** Import confirmation is an explicit UI action; neither preview nor file parsing mutates storage. */
export function confirmObservationImport(preview: ObservationPreview): ObservationArtifact {
  if (!previews.has(preview)) throw new Error('먼저 원본에서 미리보기를 생성하고 확인하세요.');
  return preview.artifact;
}

export function serializeObservationArtifact(artifact: ObservationArtifact): string {
  const text = JSON.stringify(inspectObservationData(artifact), null, 2);
  if (encoder.encode(text).length > OBSERVATION_LIMITS.fileBytes)
    throw new Error('관측 파일 크기 제한을 초과했습니다.');
  return text;
}

/** Replay unit, calibration, time and missing-data operations against immutable originals before accepting lineage. */
export async function validateObservationArtifact(input: unknown): Promise<ObservationArtifact> {
  const data = inspectObservationData(input) as ObservationArtifact;
  if (!data || data.schema !== 'pendulum-observation/v1' || !data.original || !data.transform)
    throw new Error('지원하지 않는 관측 파일 schema입니다.');
  const media = data.original.media;
  const request: ObservationImportRequest = {
    text: data.original.text,
    name: data.original.name,
    kind: data.original.kind,
    mapping: data.transform.mapping,
    options: data.transform.options,
    ...(media ? { media: { name: media.name, mime: media.mime, base64: media.base64 } } : {}),
    ...(data.original.capture ? { capture: data.original.capture } : {})
  };
  const rebuilt = (await previewObservationImport(request)).artifact;
  // Canonicalize only object order; extra fields and every numeric value remain significant.
  if (ordered(data) !== ordered(rebuilt))
    throw new Error('원본 체크섬·변환 이력 또는 계산된 관측값이 일치하지 않습니다. 원본을 보존하세요.');
  return rebuilt;
}

export async function parseObservationArtifact(text: string): Promise<ObservationArtifact> {
  if (encoder.encode(text).length > OBSERVATION_LIMITS.fileBytes)
    throw new Error('관측 파일은 16 MiB 이하여야 합니다.');
  return validateObservationArtifact(JSON.parse(text) as unknown);
}

export function toDoublePendulumObservation(artifact: ObservationArtifact): DoublePendulumObservation {
  if (artifact.data.angles.some((angles) => angles.length !== 2))
    throw new Error('이중진자 매개변수 추정에는 theta1·theta2 두 각도 채널이 필요합니다.');
  return {
    times: [...artifact.data.times],
    angles: artifact.data.angles.map((angles) => [angles[0]!, angles[1]!] as const)
  };
}
