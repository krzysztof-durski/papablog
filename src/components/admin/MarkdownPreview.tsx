import { useMemo } from 'react';
import { marked } from 'marked';

interface Props {
  markdown: string;
}

export default function MarkdownPreview({ markdown }: Props) {
  // dangerouslySetInnerHTML is deliberate here, not an oversight: this
  // preview is rendered only in the writer's own browser, from their own
  // in-progress draft, never persisted as HTML and never shown to any
  // other person — there's no boundary here for a sanitizer to enforce.
  const html = useMemo(() => marked.parse(markdown || '_Nothing written yet…_', { async: false }), [markdown]);

  return (
    <div
      className="prose prose-slate dark:prose-invert h-full max-w-none overflow-y-auto rounded-md border border-slate-200 p-4 dark:border-slate-800"
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- see comment above: no trust boundary is crossed here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
