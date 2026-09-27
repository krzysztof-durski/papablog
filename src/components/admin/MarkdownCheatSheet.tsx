import { useEffect, useRef, useState } from 'react';

const ENTRIES: { syntax: string; result: string }[] = [
  { syntax: '# Heading', result: 'Heading 1' },
  { syntax: '## Heading', result: 'Heading 2' },
  { syntax: '**bold**', result: 'Bold' },
  { syntax: '_italic_', result: 'Italic' },
  { syntax: '~~strike~~', result: 'Strikethrough' },
  { syntax: '[text](url)', result: 'Link' },
  { syntax: '![alt](url)', result: 'Image' },
  { syntax: '- item', result: 'Bullet list' },
  { syntax: '1. item', result: 'Numbered list' },
  { syntax: '  - sub-item', result: 'Nested list item (indent 2 spaces)' },
  { syntax: '- [ ] item', result: 'Task list' },
  { syntax: '> quote', result: 'Blockquote' },
  { syntax: '`code`', result: 'Inline code' },
  { syntax: '```', result: 'Code block (fenced)' },
  { syntax: '---', result: 'Horizontal rule' },
  { syntax: '| A | B |', result: 'Table row' },
];

export default function MarkdownCheatSheet() {
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
    <div ref={containerRef} className="relative inline-block">
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
          className="absolute top-full left-0 z-10 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-xs normal-case shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-2 font-semibold text-slate-700 dark:text-slate-300">Markdown cheat sheet</p>
          <table className="w-full border-separate border-spacing-y-1 text-left">
            <tbody>
              {ENTRIES.map((entry) => (
                <tr key={entry.syntax}>
                  <td>
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono whitespace-pre text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      {entry.syntax}
                    </code>
                  </td>
                  <td className="pl-3 text-slate-500 dark:text-slate-500">{entry.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
