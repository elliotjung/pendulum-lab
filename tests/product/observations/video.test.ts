import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewRecordedVideo, validateTrackingSpec } from '../../../src/product/observations';
import { parseObservationArtifact, serializeObservationArtifact } from '../../../src/product/observations';
import { trackDoublePendulumFrame } from '../../../src/research/videoTracking';

const tracking = {
  pivot: { x: 4, y: 2 },
  first: { red: 255, green: 0, blue: 0, tolerance: 20 },
  second: { red: 0, green: 255, blue: 255, tolerance: 20 },
  yAxis: 'down' as const
};
const bytes = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);
const videoFile = () => new File([bytes], 'marker.mp4', { type: 'video/mp4' });

function frame() {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  data.set([255, 0, 0, 255], (4 + 4 * 8) * 4);
  data.set([0, 255, 255, 255], (6 + 4 * 8) * 4);
  return { width: 8, height: 8, data };
}

class TestVideo extends EventTarget {
  preload = '';
  muted = false;
  playsInline = false;
  src = '';
  videoWidth = 8;
  videoHeight = 8;
  duration = 1;
  readyState = 2;
  private time = 0;
  set currentTime(value: number) {
    this.time = value;
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
  get currentTime() {
    return this.time;
  }
  load() {
    if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  }
  pause = vi.fn();
  removeAttribute() {
    this.src = '';
  }
}

function decoder(
  input: { dimensions?: [number, number]; duration?: number; blank?: boolean; metadata?: boolean } = {}
) {
  const video = new TestVideo();
  if (input.dimensions) [video.videoWidth, video.videoHeight] = input.dimensions;
  if (input.duration !== undefined) video.duration = input.duration;
  if (input.metadata === false) video.load = () => {};
  const getImageData = vi.fn(() =>
    input.blank ? { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) } : frame()
  );
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), getImageData }) };
  vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'video' ? video : canvas) });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { video, canvas, getImageData, create, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('S22 recorded video marker adapter', () => {
  it('uses native tracking, retains exact video source and restores preview-confirm lineage', async () => {
    const { video, canvas, revoke } = decoder();
    const progress: number[] = [];
    const preview = await previewRecordedVideo(videoFile(), tracking, { sampleCount: 3 }, undefined, (value) =>
      progress.push(value)
    );
    const native = trackDoublePendulumFrame(frame(), tracking)!;
    expect(preview.artifact.data.angles).toEqual(Array.from({ length: 3 }, () => [...native.angles]));
    expect(preview.artifact.original.kind).toBe('video');
    expect(preview.artifact.original.media!.base64).toBe(btoa(String.fromCharCode(...bytes)));
    expect(preview.artifact.original.media!.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.artifact.original.capture).toMatchObject({
      algorithm: 'native-colorMarkerCentroid/v1',
      sampleCount: 3,
      width: 8,
      height: 8,
      missedFrames: 0,
      coordinateFrame: 'sampled-canvas-pixels'
    });
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    expect(await parseObservationArtifact(serializeObservationArtifact(preview.artifact))).toEqual(preview.artifact);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local-test');
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('preserves user time scale, offset and channel calibration separately from known pixel/second units', async () => {
    decoder();
    const { artifact } = await previewRecordedVideo(videoFile(), tracking, {
      sampleCount: 2,
      transform: { timeScale: 2, timeOffset: 1, angleScale: [1, -1], angleOffset: [0.1, 0.2] }
    });
    expect(artifact.data.times).toEqual([1, 2.998]);
    expect(artifact.data.angles[0]).toEqual([0.1, -Math.PI / 2 + 0.2]);
    expect(artifact.transform.options.pivot).toEqual(tracking.pivot);
  });

  it('releases video and blob on tracking loss and preserves no fake successful samples', async () => {
    const { video, revoke } = decoder({ blank: true });
    await expect(previewRecordedVideo(videoFile(), tracking, { sampleCount: 2 })).rejects.toThrow(/결측값/u);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('cancels immediately without reading a file', async () => {
    const file = videoFile();
    const read = vi.spyOn(file, 'arrayBuffer');
    const controller = new AbortController();
    controller.abort();
    await expect(previewRecordedVideo(file, tracking, { sampleCount: 2 }, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('cancels after progress and cleans up decoder state', async () => {
    const { video, revoke, getImageData } = decoder();
    const controller = new AbortController();
    await expect(
      previewRecordedVideo(videoFile(), tracking, { sampleCount: 16 }, controller.signal, () => controller.abort())
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getImageData).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('cancels while waiting for metadata and does not leak event listeners', async () => {
    const { video, revoke } = decoder({ metadata: false });
    const remove = vi.spyOn(video, 'removeEventListener');
    const controller = new AbortController();
    const pending = previewRecordedVideo(videoFile(), tracking, { sampleCount: 2 }, controller.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(remove).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function));
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('times out bounded metadata decoding instead of leaving a permanent loading state', async () => {
    vi.useFakeTimers();
    const { revoke } = decoder({ metadata: false });
    const pending = previewRecordedVideo(videoFile(), tracking, { sampleCount: 2 });
    const rejection = expect(pending).rejects.toThrow(/10초/u);
    await vi.advanceTimersByTimeAsync(10000);
    await rejection;
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1, 257, 2.5, Infinity])('rejects invalid sample count %s before reading', async (sampleCount) => {
    const file = videoFile();
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(previewRecordedVideo(file, tracking, { sampleCount })).rejects.toThrow(/표본 수/u);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects oversize media before allocating its contents', async () => {
    const file = { size: 8 * 1024 * 1024 + 1, type: 'video/mp4', arrayBuffer: vi.fn() };
    await expect(previewRecordedVideo(file as unknown as File, tracking, { sampleCount: 2 })).rejects.toThrow(/8 MiB/u);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects disguised SVG/HTML input without creating a browser decoder', async () => {
    const { create } = decoder();
    const file = new File(['<svg><script>alert(1)</script></svg>'], 'evil.mp4', { type: 'video/mp4' });
    await expect(previewRecordedVideo(file, tracking, { sampleCount: 2 })).rejects.toThrow(/서명/u);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([Infinity, 0, 61])('rejects nonfinite/unsupported video duration %s', async (duration) => {
    const { revoke, getImageData } = decoder({ duration });
    await expect(previewRecordedVideo(videoFile(), tracking, { sampleCount: 2 })).rejects.toThrow(/60초/u);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(getImageData).not.toHaveBeenCalled();
  });

  it('bounds pixel work before sampling, including downsampled high resolution inputs', async () => {
    const { revoke, getImageData } = decoder({ dimensions: [1920, 1080] });
    await expect(previewRecordedVideo(videoFile(), tracking, { sampleCount: 256 })).rejects.toThrow(/24 Mi pixel/u);
    expect(getImageData).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    [4096, 2160],
    [8193, 2],
    [2, 8193],
    [Infinity, 480],
    [640, NaN],
    [640.5, 480],
    [0, 480]
  ])('rejects source decoder dimensions %s×%s before loading frame pixels', async (width, height) => {
    const { video, revoke, getImageData } = decoder({ dimensions: [width, height] });
    video.readyState = 0;
    await expect(previewRecordedVideo(videoFile(), tracking, { sampleCount: 2 })).rejects.toThrow(/8 Mi pixel/u);
    expect(video.preload).toBe('metadata');
    expect(getImageData).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('rejects overlapping colour targets and invalid marker specifications', () => {
    expect(() => validateTrackingSpec({ ...tracking, second: tracking.first })).toThrow(/겹칩니다/u);
    expect(() => validateTrackingSpec({ ...tracking, pivot: { x: NaN, y: 0 } })).toThrow();
    expect(() => validateTrackingSpec({ ...tracking, first: { ...tracking.first, red: 256 } })).toThrow();
    expect(() => validateTrackingSpec({ ...tracking, first: { ...tracking.first, minPixels: 0 } })).toThrow();
  });
});
