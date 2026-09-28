import { useState } from 'react';
import { extractStringField } from '../../lib/http/responseFields';

type DraftStatus = 'draft' | 'published' | 'archived';

interface Props {
  draftId: string;
  status: DraftStatus;
  slug: string | null;
  onChange: (next: { status: DraftStatus; slug: string | null }) => void;
}

const buttonClass = 'rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass = `${buttonClass} border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-slate-900`;
const dangerButtonClass = `${buttonClass} border-red-600 text-red-600 hover:bg-red-600 hover:text-white dark:border-red-400 dark:text-red-400 dark:hover:bg-red-400 dark:hover:text-slate-900`;

async function extractSlug(res: Response): Promise<string | null> {
  const data: unknown = await res.json().catch(() => null);
  if (data && typeof data === 'object' && 'draft' in data) {
    return extractStringField(data.draft, 'slug');
  }
  return null;
}

export default function PublishControls({ draftId, status, slug, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function callEndpoint(endpoint: 'publish' | 'unpublish', nextStatus: DraftStatus, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        throw new Error(extractStringField(data, 'error') ?? `Failed to ${endpoint}.`);
      }

      const resolvedSlug = await extractSlug(res);
      setMessage({ kind: 'success', text: successText });
      onChange({ status: nextStatus, slug: resolvedSlug ?? slug });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : `Failed to ${endpoint}.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === 'published' && slug && (
        <a
          href={`/posts/${slug}/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          View live post ↗
        </a>
      )}

      {status !== 'archived' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void callEndpoint(
              'publish',
              'published',
              status === 'published' ? 'Updated and republished.' : 'Published — live now.',
            );
          }}
          className={primaryButtonClass}
        >
          {busy ? 'Publishing…' : status === 'published' ? 'Update & Republish' : 'Publish'}
        </button>
      )}

      {status === 'archived' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void callEndpoint('publish', 'published', 'Republished — live now.');
          }}
          className={primaryButtonClass}
        >
          {busy ? 'Publishing…' : 'Republish'}
        </button>
      )}

      {status === 'published' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void callEndpoint('unpublish', 'archived', 'Unpublished.');
          }}
          className={dangerButtonClass}
        >
          {busy ? 'Working…' : 'Unpublish'}
        </button>
      )}

      {message && (
        <span
          className={`text-xs ${message.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
          aria-live="polite"
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
