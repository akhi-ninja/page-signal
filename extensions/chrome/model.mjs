export const MAX_BYTES = 30 * 1024 * 1024;
const TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/bmp']);
export function validateFile(file) {
  if (!file || !TYPES.has(file.type)) throw new Error('Choose a PDF, PNG, JPEG, WEBP or BMP file.');
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a nonempty file up to 30 MiB.');
  return { name: file.name, media_type: file.type, size_bytes: file.size };
}
