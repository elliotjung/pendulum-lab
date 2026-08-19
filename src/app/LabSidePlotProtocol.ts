import type { Point2D } from '../viz/poincare';

export type LabSidePlotId = 'energy' | 'lyap' | 'phase' | 'poincare' | 'fft';

/**
 * Versioned, fixed-size SharedArrayBuffer transport for side-plot snapshots.
 * The data region is intentionally bounded: unusually large snapshots retain
 * the ordinary transferable-ArrayBuffer path rather than growing shared
 * memory without limit.
 */
export const LAB_SIDE_PLOT_SHARED_RING_PROTOCOL = 1;
export const LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS = 8;
export const MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS = 16;
export const MAX_LAB_SIDE_PLOT_SHARED_RING_SLOT_FLOATS = 262_144;
export const MAX_LAB_SIDE_PLOT_SHARED_RING_FLOATS =
  MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS * MAX_LAB_SIDE_PLOT_SHARED_RING_SLOT_FLOATS;
export const MAX_LAB_SIDE_PLOT_SHARED_SEQUENCE = 2_147_483_647;

export interface LabSidePlotSharedRingDescriptor {
  protocol: typeof LAB_SIDE_PLOT_SHARED_RING_PROTOCOL;
  capacity: number;
  slotFloatCapacity: number;
  metadata: SharedArrayBuffer;
  values: SharedArrayBuffer;
}

export interface LabSidePlotEnergyPayload {
  plot: 'energy';
  energy: { time: Float32Array; total: Float32Array; drift: Float32Array };
}

export interface LabSidePlotPhasePayload {
  plot: 'phase';
  theta: Float32Array;
  omega: Float32Array;
}

export interface LabSidePlotPoincarePayload {
  plot: 'poincare';
  points: Float32Array;
}

export type LabSidePlotPayload =
  | LabSidePlotEnergyPayload
  | { plot: 'lyap'; history: Float32Array; value: number }
  | LabSidePlotPhasePayload
  | LabSidePlotPoincarePayload
  | { plot: 'fft'; theta1Frames: Float32Array; sampleRate: number };

export type LabSidePlotWorkerMessage =
  | { kind: 'canvas'; plot: LabSidePlotId; canvas: OffscreenCanvas }
  | { kind: 'shared-init'; transport: LabSidePlotSharedRingDescriptor }
  | { kind: 'render'; plot: LabSidePlotId; width: number; height: number; dpr: number; payload: LabSidePlotPayload }
  | {
      kind: 'render-shared';
      plot: LabSidePlotId;
      width: number;
      height: number;
      dpr: number;
      slot: number;
      sequence: number;
    };

export type LabSidePlotWorkerResponse =
  | { kind: 'ready'; plot: LabSidePlotId }
  | { kind: 'shared-ready'; protocol: typeof LAB_SIDE_PLOT_SHARED_RING_PROTOCOL }
  | { kind: 'shared-unavailable'; detail: string }
  | {
      kind: 'rendered';
      plot: LabSidePlotId;
      elapsedMs: number;
      transport?: 'transfer' | 'shared';
      slot?: number;
      sequence?: number;
    }
  | { kind: 'dropped'; plot: LabSidePlotId }
  | { kind: 'error'; plot?: LabSidePlotId; detail: string };

export const LAB_SIDE_PLOT_IDS: readonly LabSidePlotId[] = ['energy', 'lyap', 'phase', 'poincare', 'fft'];
export const MAX_SIDE_PLOT_FLOATS = 1_000_000;
const MAX_CANVAS_EDGE = 16_384;

function isPlot(value: unknown): value is LabSidePlotId {
  return typeof value === 'string' && LAB_SIDE_PLOT_IDS.includes(value as LabSidePlotId);
}

function finiteArray(value: unknown, maximum = MAX_SIDE_PLOT_FLOATS): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) return false;
  }
  return true;
}

function finiteDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= MAX_CANVAS_EDGE;
}

function finiteDpr(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 8;
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function safeSharedSequence(value: unknown): value is number {
  return safeInteger(value) && value >= 1 && value <= MAX_LAB_SIDE_PLOT_SHARED_SEQUENCE;
}

function sharedBuffer(value: unknown): value is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer;
}

/** Guard descriptors before a worker constructs typed views over shared memory. */
export function isLabSidePlotSharedRingDescriptor(value: unknown): value is LabSidePlotSharedRingDescriptor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const descriptor = value as {
    protocol?: unknown;
    capacity?: unknown;
    slotFloatCapacity?: unknown;
    metadata?: unknown;
    values?: unknown;
  };
  const { capacity, slotFloatCapacity, metadata, values } = descriptor;
  if (
    descriptor.protocol !== LAB_SIDE_PLOT_SHARED_RING_PROTOCOL ||
    !safeInteger(capacity) ||
    capacity < 1 ||
    capacity > MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS ||
    !safeInteger(slotFloatCapacity) ||
    slotFloatCapacity < 1 ||
    slotFloatCapacity > MAX_LAB_SIDE_PLOT_SHARED_RING_SLOT_FLOATS ||
    capacity * slotFloatCapacity > MAX_LAB_SIDE_PLOT_SHARED_RING_FLOATS ||
    !sharedBuffer(metadata) ||
    !sharedBuffer(values)
  ) {
    return false;
  }
  const expectedMetadataBytes = capacity * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS * Int32Array.BYTES_PER_ELEMENT;
  const expectedValueBytes = capacity * slotFloatCapacity * Float32Array.BYTES_PER_ELEMENT;
  return metadata.byteLength === expectedMetadataBytes && values.byteLength === expectedValueBytes;
}

export function isLabSidePlotPayload(value: unknown): value is LabSidePlotPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<LabSidePlotPayload>;
  if (payload.plot === 'energy') {
    const energy = payload.energy;
    return (
      energy !== null &&
      typeof energy === 'object' &&
      finiteArray(energy.time) &&
      finiteArray(energy.total) &&
      finiteArray(energy.drift) &&
      energy.time.length === energy.total.length &&
      energy.time.length === energy.drift.length &&
      energy.time.length * 3 <= MAX_SIDE_PLOT_FLOATS
    );
  }
  if (payload.plot === 'lyap') {
    return finiteArray(payload.history) && typeof payload.value === 'number' && Number.isFinite(payload.value);
  }
  if (payload.plot === 'phase') {
    return (
      finiteArray(payload.theta) &&
      finiteArray(payload.omega) &&
      payload.theta.length === payload.omega.length &&
      payload.theta.length * 2 <= MAX_SIDE_PLOT_FLOATS
    );
  }
  if (payload.plot === 'poincare') {
    return finiteArray(payload.points) && payload.points.length % 2 === 0;
  }
  if (payload.plot === 'fft') {
    return (
      finiteArray(payload.theta1Frames) &&
      typeof payload.sampleRate === 'number' &&
      Number.isFinite(payload.sampleRate) &&
      payload.sampleRate > 0 &&
      payload.sampleRate <= 1_000_000_000
    );
  }
  return false;
}

export function isLabSidePlotWorkerMessage(value: unknown): value is LabSidePlotWorkerMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as {
    kind?: unknown;
    plot?: unknown;
    canvas?: unknown;
    transport?: unknown;
    width?: unknown;
    height?: unknown;
    dpr?: unknown;
    payload?: unknown;
    slot?: unknown;
    sequence?: unknown;
  };
  if (message.kind === 'canvas') {
    const canvas = message.canvas;
    return (
      isPlot(message.plot) &&
      canvas !== null &&
      typeof canvas === 'object' &&
      typeof (canvas as { getContext?: unknown }).getContext === 'function'
    );
  }
  if (message.kind === 'shared-init') return isLabSidePlotSharedRingDescriptor(message.transport);
  if (
    !isPlot(message.plot) ||
    !finiteDimension(message.width) ||
    !finiteDimension(message.height) ||
    !finiteDpr(message.dpr)
  ) {
    return false;
  }
  if (message.kind === 'render-shared') {
    return (
      typeof message.slot === 'number' &&
      safeInteger(message.slot) &&
      message.slot >= 0 &&
      safeSharedSequence(message.sequence)
    );
  }
  return message.kind === 'render' && isLabSidePlotPayload(message.payload) && message.payload.plot === message.plot;
}

export function isLabSidePlotWorkerResponse(value: unknown): value is LabSidePlotWorkerResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as {
    kind?: unknown;
    plot?: unknown;
    protocol?: unknown;
    detail?: unknown;
    elapsedMs?: unknown;
    transport?: unknown;
    slot?: unknown;
    sequence?: unknown;
  };
  if (response.kind === 'ready' || response.kind === 'dropped') return isPlot(response.plot);
  if (response.kind === 'shared-ready') return response.protocol === LAB_SIDE_PLOT_SHARED_RING_PROTOCOL;
  if (response.kind === 'shared-unavailable') {
    return typeof response.detail === 'string' && response.detail.length > 0 && response.detail.length <= 4_096;
  }
  if (response.kind === 'rendered') {
    const base =
      isPlot(response.plot) &&
      typeof response.elapsedMs === 'number' &&
      Number.isFinite(response.elapsedMs) &&
      response.elapsedMs >= 0;
    if (!base) return false;
    if (response.transport === undefined) return response.slot === undefined && response.sequence === undefined;
    if (response.transport === 'transfer') return response.slot === undefined && response.sequence === undefined;
    return (
      response.transport === 'shared' &&
      typeof response.slot === 'number' &&
      safeInteger(response.slot) &&
      response.slot >= 0 &&
      safeSharedSequence(response.sequence)
    );
  }
  return (
    response.kind === 'error' &&
    (response.plot === undefined || isPlot(response.plot)) &&
    typeof response.detail === 'string' &&
    response.detail.length > 0 &&
    response.detail.length <= 4_096
  );
}

export function sidePlotTransferables(payload: LabSidePlotPayload): Transferable[] {
  if (!isLabSidePlotPayload(payload)) throw new RangeError('side-plot payload is malformed or exceeds its work budget');
  const buffers: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  const add = (view: Float32Array): void => {
    if (view.buffer instanceof ArrayBuffer && !seen.has(view.buffer)) {
      seen.add(view.buffer);
      buffers.push(view.buffer);
    }
  };

  switch (payload.plot) {
    case 'energy':
      add(payload.energy.time);
      add(payload.energy.total);
      add(payload.energy.drift);
      break;
    case 'lyap':
      add(payload.history);
      break;
    case 'phase':
      add(payload.theta);
      add(payload.omega);
      break;
    case 'poincare':
      add(payload.points);
      break;
    case 'fft':
      add(payload.theta1Frames);
      break;
  }
  return buffers;
}

export function pairsToPoints(pairs: Float32Array): Point2D[] {
  if (!finiteArray(pairs) || pairs.length % 2 !== 0) {
    throw new RangeError('Poincare pairs must be a finite, even-length Float32Array within budget');
  }
  const n = Math.floor(pairs.length / 2);
  const points: Point2D[] = new Array(n);
  for (let i = 0; i < n; i += 1) points[i] = { x: pairs[i * 2] ?? 0, y: pairs[i * 2 + 1] ?? 0 };
  return points;
}
