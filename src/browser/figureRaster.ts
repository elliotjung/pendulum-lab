/** Upscale a browser canvas to a PNG data URL for publication export. */
export function scaleCanvasToPngDataUrl(source: HTMLCanvasElement, scale: 1 | 2 | 4): string {
  const width = source.width * scale;
  const height = source.height * scale;
  if (typeof OffscreenCanvas !== 'undefined' && scale !== 1) {
    try {
      const off = new OffscreenCanvas(width, height);
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, 0, width, height);
        const out = document.createElement('canvas');
        out.width = width;
        out.height = height;
        const outCtx = out.getContext('2d');
        if (outCtx) {
          outCtx.imageSmoothingEnabled = false;
          outCtx.drawImage(off, 0, 0);
          return out.toDataURL('image/png');
        }
      }
    } catch {
      // Fall through to a regular canvas when OffscreenCanvas is unavailable.
    }
  }
  if (scale === 1) return source.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return source.toDataURL('image/png');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, width, height);
  return out.toDataURL('image/png');
}
