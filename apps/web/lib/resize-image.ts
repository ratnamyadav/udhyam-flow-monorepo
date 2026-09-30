'use client';

// Client-side resize using Canvas API. Square output ≤ targetSize px,
// re-encoded as webp at q=0.88. SVG isn't accepted: script-bearing SVGs
// served from R2 would be an XSS vector.
//
// Replaces the server-side sharp pass we used to do — keeps the upload
// path off the Next.js server now that R2 PUTs go direct from the browser.

const TARGET_SIZE = 512;

export async function resizeImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/svg+xml') throw new Error('SVG logos are not supported');

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(TARGET_SIZE / bitmap.width, TARGET_SIZE / bitmap.height, 1);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas unsupported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.88 });
  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
}
