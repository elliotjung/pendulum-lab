export interface Phase3DPoint {
  x: number;
  y: number;
  z: number;
}

const MAX_CAPACITY = 100_000;

/** Allocation-free typed ring used by the live 3D phase-space trail. */
export class Phase3DTrailBuffer {
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private next = 0;
  private count = 0;

  constructor(private currentCapacity: number) {
    this.currentCapacity = validCapacity(currentCapacity);
    this.x = new Float32Array(this.currentCapacity);
    this.y = new Float32Array(this.currentCapacity);
    this.z = new Float32Array(this.currentCapacity);
  }

  get length(): number {
    return this.count;
  }

  get capacity(): number {
    return this.currentCapacity;
  }

  clear(): void {
    this.next = 0;
    this.count = 0;
  }

  resize(capacity: number): void {
    const target = validCapacity(capacity);
    if (target === this.currentCapacity) return;
    const retained = Math.min(this.count, target);
    const nextX = new Float32Array(target);
    const nextY = new Float32Array(target);
    const nextZ = new Float32Array(target);
    for (let i = 0; i < retained; i += 1) {
      const source = this.physicalIndex(this.count - retained + i);
      nextX[i] = this.x[source]!;
      nextY[i] = this.y[source]!;
      nextZ[i] = this.z[source]!;
    }
    this.currentCapacity = target;
    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
    this.count = retained;
    this.next = retained % target;
  }

  push(x: number, y: number, z: number): void {
    if (![x, y, z].every(Number.isFinite)) return;
    this.x[this.next] = x;
    this.y[this.next] = y;
    this.z[this.next] = z;
    this.next = (this.next + 1) % this.currentCapacity;
    this.count = Math.min(this.currentCapacity, this.count + 1);
  }

  read(index: number, out: Phase3DPoint): Phase3DPoint {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('trail index out of range');
    const source = this.physicalIndex(index);
    out.x = this.x[source]!;
    out.y = this.y[source]!;
    out.z = this.z[source]!;
    return out;
  }

  private physicalIndex(logicalIndex: number): number {
    const start = this.count === this.currentCapacity ? this.next : 0;
    return (start + logicalIndex) % this.currentCapacity;
  }
}

function validCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CAPACITY) {
    throw new RangeError(`phase trail capacity must be a safe integer in [1, ${MAX_CAPACITY}]`);
  }
  return value;
}
