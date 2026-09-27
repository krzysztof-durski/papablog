import { useState } from 'react';
import { extractStringField } from '../../lib/http/responseFields';

interface Props {
  draftId: string;
  coverImagePath: string | undefined;
  onUploaded: (url: string) => void;
}

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;

/** Resizes/re-encodes client-side before upload, so a 12MB phone photo never reaches the network as-is. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to encode image'));
        }
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

export default function MediaUploader({ draftId, coverImagePath, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    try {
      const resized = await resizeImage(file);
      const formData = new FormData();
      formData.append('file', resized, 'cover.webp');

      const res = await fetch(`/api/admin/drafts/${draftId}/media`, { method: 'POST', body: formData });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(extractStringField(data, 'error') ?? 'Upload failed.');
      }

      const url = extractStringField(data, 'url');
      if (!url) throw new Error('Upload response was missing a url.');
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label
        htmlFor="cover-image-input"
        className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        Cover image
      </label>
      {coverImagePath && (
        <img
          src={coverImagePath}
          alt="Current cover"
          className="mt-2 max-h-40 rounded-md border border-slate-200 dark:border-slate-800"
        />
      )}
      <input
        id="cover-image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFileSelected(file);
        }}
        className="mt-2 block text-sm text-slate-600 dark:text-slate-400"
      />
      {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
