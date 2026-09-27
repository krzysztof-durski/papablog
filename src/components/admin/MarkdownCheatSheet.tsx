import { useEffect, useRef, useState } from 'react';

interface Entry {
  syntax: string;
  result: string;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: 'Headings',
    entries: [
      { syntax: '# Heading', result: 'Heading 1' },
      { syntax: '## Heading', result: 'Heading 2' },
      { syntax: '### Heading', result: 'Heading 3' },
    ],
  },
  {
    title: 'Emphasis',
    entries: [
      { syntax: '**bold**', result: 'Bold' },
      { syntax: '_italic_', result: 'Italic' },
      { syntax: '~~strike~~', result: 'Strikethrough' },
    ],
  },
  {
    title: 'Lists',
    entries: [
      { syntax: '- item', result: 'Bullet list' },
      { syntax: '1. item', result: 'Numbered list' },
      { syntax: '  - sub-item', result: 'Nested item (indent 2 spaces)' },
      { syntax: '- [ ] item', result: 'Task list' },
    ],
  },
  {
    title: 'Links & media',
    entries: [
      { syntax: '[text](url)', result: 'Link' },
      { syntax: '![alt](url)', result: 'Image' },
    ],
  },
  {
    title: 'Other',
    entries: [
      { syntax: '> quote', result: 'Blockquote' },
      { syntax: '`code`', result: 'Inline code' },
      { syntax: '```', result: 'Code block (fenced)' },
      { syntax: '---', result: 'Horizontal rule' },
      { syntax: '| A | B |', result: 'Table row' },
    ],
  },
];

function CheatSheetGroups() {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            {group.title}
          </p>
          <ul className="space-y-1.5">
            {group.entries.map((entry) => (
              <li key={entry.syntax} className="flex flex-col gap-0.5">
                <code className="w-fit rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] whitespace-pre text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {entry.syntax}
                </code>
                <span className="text-xs text-slate-500 dark:text-slate-500">{entry.result}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Small "?" trigger that opens the cheat sheet in a popover — for narrow screens, where there's no room for a persistent side panel. Hidden at the lg breakpoint, where MarkdownCheatSheetPanel takes over instead. */
export function MarkdownCheatSheetToggle() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block lg:hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-label="Markdown syntax cheat sheet"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] leading-none font-bold text-slate-500 hover:border-slate-600 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-400 dark:hover:text-slate-200"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Markdown syntax cheat sheet"
          className="absolute top-full left-0 z-10 mt-2 max-h-96 w-80 overflow-y-auto rounded-md border border-slate-200 bg-white p-4 normal-case shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Markdown cheat sheet</p>
          <CheatSheetGroups />
        </div>
      )}
    </div>
  );
}

/** Always-visible cheat sheet panel, shown as its own column to the left of the body editor on desktop (lg and up). */
export function MarkdownCheatSheetPanel() {
  return (
    <div className="hidden h-[calc(100vh-22rem)] min-h-[24rem] flex-col lg:flex">
      <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Cheat sheet
      </span>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <CheatSheetGroups />
      </div>
    </div>
  );
}
