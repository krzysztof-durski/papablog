import { useEffect, useRef, useState } from 'react';
import type { Draft } from '../../lib/db/drafts';
import FrontmatterForm from './FrontmatterForm';
import MarkdownPreview from './MarkdownPreview';
import MediaUploader from './MediaUploader';
import PublishControls from './PublishControls';

interface Props {
  draft: Draft;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 800;

export default function PostEditor({ draft }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [tags, setTags] = useState<string[]>(draft.tags);
  const [bodyMarkdown, setBodyMarkdown] = useState(draft.bodyMarkdown);
  const [coverImagePath, setCoverImagePath] = useState<string | undefined>(draft.coverImagePath ?? undefined);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [publishState, setPublishState] = useState<{ status: Draft['status']; slug: string | null }>({
    status: draft.status,
    slug: draft.slug,
  });

  // Guards the very first render's effect run so a freshly-opened, unedited
  // draft doesn't immediately PUT itself back unchanged.
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const controller = new AbortController();
      setStatus('saving');

      fetch(`/api/admin/drafts/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, tags, bodyMarkdown, coverImagePath }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error('Save failed');
          setStatus('saved');
          setLastSavedAt(new Date());
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setStatus('error');
        });

      return () => {
        controller.abort();
      };
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [draft.id, title, description, tags, bodyMarkdown, coverImagePath]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-500">
          {publishState.status === 'published' && 'Published'}
          {publishState.status === 'archived' && 'Unpublished'}
          {publishState.status === 'draft' && 'Draft — never published'}
        </span>
        <PublishControls
          draftId={draft.id}
          status={publishState.status}
          slug={publishState.slug}
          onChange={setPublishState}
        />
      </div>

      <FrontmatterForm
        title={title}
        onTitleChange={setTitle}
        description={description}
        onDescriptionChange={setDescription}
        tags={tags}
        onTagsChange={setTags}
      />

      <div className="mt-4">
        <MediaUploader draftId={draft.id} coverImagePath={coverImagePath} onUploaded={setCoverImagePath} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex h-[calc(100vh-22rem)] min-h-[24rem] flex-col">
          <label
            htmlFor="post-body"
            className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
          >
            Body (Markdown)
          </label>
          <textarea
            id="post-body"
            value={bodyMarkdown}
            onChange={(event) => {
              setBodyMarkdown(event.target.value);
            }}
            placeholder="Write in Markdown…"
            className="mt-1 w-full flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="flex h-[calc(100vh-22rem)] min-h-[24rem] flex-col">
          <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Preview
          </span>
          <div className="mt-1 min-h-0 flex-1">
            <MarkdownPreview markdown={bodyMarkdown} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-500" aria-live="polite">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && lastSavedAt && `Saved at ${lastSavedAt.toLocaleTimeString()}`}
        {status === 'error' && (
          <span className="text-red-600 dark:text-red-400">Save failed — check your connection.</span>
        )}
        {status === 'idle' && 'Autosaves as you type.'}
      </p>
    </div>
  );
}
