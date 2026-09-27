import { useState } from 'react';

interface Props {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  tags: string[];
  onTagsChange: (value: string[]) => void;
}

const fieldLabelClass = 'block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400';
const fieldInputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

export default function FrontmatterForm({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
}: Props) {
  // Kept as its own local string so the field shows exactly what was typed
  // (trailing commas, in-progress words) — deriving it back from `tags`
  // every keystroke would fight the user's cursor mid-edit.
  const [tagsText, setTagsText] = useState(tags.join(', '));

  function handleTagsChange(value: string) {
    setTagsText(value);
    onTagsChange(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr_1fr]">
      <div>
        <label htmlFor="post-title" className={fieldLabelClass}>
          Title
        </label>
        <input
          id="post-title"
          type="text"
          value={title}
          onChange={(event) => {
            onTitleChange(event.target.value);
          }}
          placeholder="Post title"
          className={`${fieldInputClass} font-brand text-lg font-bold`}
        />
      </div>
      <div>
        <label htmlFor="post-description" className={fieldLabelClass}>
          Description
        </label>
        <input
          id="post-description"
          type="text"
          value={description}
          onChange={(event) => {
            onDescriptionChange(event.target.value);
          }}
          placeholder="One or two sentences — used for previews, RSS, and search results"
          className={`${fieldInputClass} text-sm`}
        />
      </div>
      <div>
        <label htmlFor="post-tags" className={fieldLabelClass}>
          Tags
        </label>
        <input
          id="post-tags"
          type="text"
          value={tagsText}
          onChange={(event) => {
            handleTagsChange(event.target.value);
          }}
          placeholder="astro, cloudflare"
          className={`${fieldInputClass} text-sm`}
        />
      </div>
    </div>
  );
}
