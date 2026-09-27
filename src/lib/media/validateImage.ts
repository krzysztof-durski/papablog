const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export type ImageValidationResult = { valid: true; extension: string } | { valid: false; error: string };

export function validateImageUpload(contentType: string, size: number): ImageValidationResult {
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) {
    return { valid: false, error: `Unsupported image type "${contentType}". Allowed: png, jpeg, webp, avif.` };
  }
  if (size <= 0) {
    return { valid: false, error: 'Empty file.' };
  }
  if (size > MAX_IMAGE_BYTES) {
    return { valid: false, error: `Image exceeds the ${String(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit.` };
  }
  return { valid: true, extension };
}
