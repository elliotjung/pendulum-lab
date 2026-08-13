import { Miniflare } from 'miniflare';
import sharp from 'sharp';

const worker = `
export default {
  async fetch(request, env) {
    const output = await env.IMAGES
      .input(request.body)
      .transform({ width: 4, height: 3 })
      .output({ format: "image/png" });
    return output.response();
  }
};
`;

const input = await sharp({
  create: { width: 2, height: 2, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 0.75 } }
})
  .png()
  .toBuffer();

const miniflare = new Miniflare({
  modules: true,
  script: worker,
  compatibilityFlags: ['streams_enable_constructors'],
  images: { binding: 'IMAGES' }
});
const deadline = AbortSignal.timeout(30_000);

try {
  const response = await miniflare.dispatchFetch('http://local.images/transform', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: input,
    signal: deadline
  });
  if (!response.ok) throw new Error(`Miniflare Images returned ${response.status}: ${await response.text()}`);
  const encoded = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(encoded).metadata();
  if (metadata.format !== 'png' || metadata.width !== 4 || metadata.height !== 3) {
    throw new Error(`Unexpected transformed image metadata: ${JSON.stringify(metadata)}`);
  }
  console.log(
    `Miniflare Images smoke passed (sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}, ${encoded.length} bytes).`
  );
} finally {
  await miniflare.dispose();
}
