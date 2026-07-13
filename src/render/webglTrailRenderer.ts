/**
 * WebGL2 batched trail renderer.
 *
 * The module deliberately owns no simulation or DOM state. It converts a
 * packed pixel polyline into one instanced quad per segment, then draws all
 * segments in a single `drawArraysInstanced` call. The Lab only requests this
 * backend in its explicit cinematic experiment; every creation/draw failure
 * is reported as `false` so Canvas2D remains the authority and fallback.
 */

export interface TrailInstanceBatch {
  /** Packed [x0, y0, x1, y1, age] records, oldest to newest. */
  instances: Float32Array;
  segmentCount: number;
}

export interface WebGLTrailDrawOptions {
  width: number;
  height: number;
  lineWidth?: number;
  additive?: boolean;
  oldColor?: readonly [number, number, number, number];
  newColor?: readonly [number, number, number, number];
}

export interface TrailCanvasLike {
  width: number;
  height: number;
  getContext(contextId: 'webgl2', options?: WebGLContextAttributes): WebGL2RenderingContext | null;
}

/** Explicit feature flag. Cinematic quality is checked separately by LabApp. */
export function webGLTrailRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('webglTrail') === '1';
}

/**
 * Build instanced segment records from a packed [x,y,...] polyline. Invalid
 * points break the line rather than feeding NaN into the GPU.
 */
export function buildTrailInstances(points: ArrayLike<number>): TrailInstanceBatch {
  const pointCount = Math.floor(points.length / 2);
  if (pointCount < 2) return { instances: new Float32Array(0), segmentCount: 0 };

  const records: number[] = [];
  const denominator = Math.max(1, pointCount - 2);
  for (let i = 1; i < pointCount; i += 1) {
    const x0 = Number(points[(i - 1) * 2]);
    const y0 = Number(points[(i - 1) * 2 + 1]);
    const x1 = Number(points[i * 2]);
    const y1 = Number(points[i * 2 + 1]);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    records.push(x0, y0, x1, y1, (i - 1) / denominator);
  }
  return { instances: Float32Array.from(records), segmentCount: records.length / 5 };
}

/** Return a chronological packed view of a [x,y] ring without mutating it. */
export function orderedTrailPoints(buffer: Float32Array, nextIndex: number, filled: number): Float32Array {
  const capacity = Math.floor(buffer.length / 2);
  const count = Math.max(0, Math.min(capacity, Math.floor(filled)));
  if (count === 0 || capacity === 0) return new Float32Array(0);
  const start = (((Math.floor(nextIndex) - count) % capacity) + capacity) % capacity;
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const source = (start + i) % capacity;
    out[i * 2] = buffer[source * 2] ?? 0;
    out[i * 2 + 1] = buffer[source * 2 + 1] ?? 0;
  }
  return out;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec4 a_segment;
in float a_age;
uniform vec2 u_viewport;
uniform float u_halfWidth;
out float v_age;

void main() {
  vec2 start = a_segment.xy;
  vec2 finish = a_segment.zw;
  vec2 direction = finish - start;
  float magnitude = max(length(direction), 0.0001);
  vec2 normal = vec2(-direction.y, direction.x) / magnitude;
  int corner = gl_VertexID % 6;
  float along = (corner == 0 || corner == 3 || corner == 5) ? 0.0 : 1.0;
  float side = (corner == 0 || corner == 1 || corner == 3) ? -1.0 : 1.0;
  vec2 pixel = mix(start, finish, along) + normal * side * u_halfWidth;
  vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_age = a_age;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 u_oldColor;
uniform vec4 u_newColor;
in float v_age;
out vec4 outColor;

void main() {
  outColor = mix(u_oldColor, u_newColor, clamp(v_age, 0.0, 1.0));
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL2 trail: shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`WebGL2 trail shader compile failed: ${detail}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 trail: program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL2 trail program link failed: ${detail}`);
  }
  return program;
}

export class WebGLTrailRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly viewportLocation: WebGLUniformLocation;
  private readonly halfWidthLocation: WebGLUniformLocation;
  private readonly oldColorLocation: WebGLUniformLocation;
  private readonly newColorLocation: WebGLUniformLocation;

  constructor(private readonly canvas: TrailCanvasLike) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 trail context unavailable');
    this.gl = gl;
    this.program = createProgram(gl);
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buffer || !vao) throw new Error('WebGL2 trail buffer allocation failed');
    this.buffer = buffer;
    this.vao = vao;

    const viewport = gl.getUniformLocation(this.program, 'u_viewport');
    const halfWidth = gl.getUniformLocation(this.program, 'u_halfWidth');
    const oldColor = gl.getUniformLocation(this.program, 'u_oldColor');
    const newColor = gl.getUniformLocation(this.program, 'u_newColor');
    if (!viewport || !halfWidth || !oldColor || !newColor) throw new Error('WebGL2 trail uniforms unavailable');
    this.viewportLocation = viewport;
    this.halfWidthLocation = halfWidth;
    this.oldColorLocation = oldColor;
    this.newColorLocation = newColor;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const segmentLocation = gl.getAttribLocation(this.program, 'a_segment');
    const ageLocation = gl.getAttribLocation(this.program, 'a_age');
    if (segmentLocation < 0 || ageLocation < 0) throw new Error('WebGL2 trail attributes unavailable');
    gl.enableVertexAttribArray(segmentLocation);
    gl.vertexAttribPointer(segmentLocation, 4, gl.FLOAT, false, 5 * 4, 0);
    gl.vertexAttribDivisor(segmentLocation, 1);
    gl.enableVertexAttribArray(ageLocation);
    gl.vertexAttribPointer(ageLocation, 1, gl.FLOAT, false, 5 * 4, 4 * 4);
    gl.vertexAttribDivisor(ageLocation, 1);
    gl.bindVertexArray(null);
  }

  draw(points: ArrayLike<number>, options: WebGLTrailDrawOptions): boolean {
    const batch = buildTrailInstances(points);
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (batch.segmentCount === 0) return true;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.instances, gl.DYNAMIC_DRAW);
    gl.uniform2f(this.viewportLocation, width, height);
    gl.uniform1f(this.halfWidthLocation, Math.max(0.25, (options.lineWidth ?? 1.4) / 2));
    gl.uniform4fv(this.oldColorLocation, options.oldColor ?? [0.08, 0.14, 0.23, 0.08]);
    gl.uniform4fv(this.newColorLocation, options.newColor ?? [0, 0.83, 1, 0.88]);
    gl.enable(gl.BLEND);
    if (options.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batch.segmentCount);
    gl.bindVertexArray(null);
    return gl.getError() === gl.NO_ERROR;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}

/** Never throws: callers can immediately continue through Canvas2D. */
export function tryCreateWebGLTrailRenderer(canvas: TrailCanvasLike): WebGLTrailRenderer | null {
  try {
    return new WebGLTrailRenderer(canvas);
  } catch {
    return null;
  }
}
