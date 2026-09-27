const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Converts an FTS5 `snippet()` result (which wraps matches in `[` `]`) into
 * safe HTML with matches marked, escaping everything else. FTS5's own
 * markers were chosen specifically so they can't collide with real `<`/`>`
 * characters in the escaped output.
 */
export function snippetToHtml(snippet: string): string {
  return snippet
    .split(/(\[[^[\]]*\])/g)
    .map((part) => {
      const match = /^\[([^[\]]*)\]$/.exec(part);
      return match
        ? `<mark class="bg-yellow-200 dark:bg-yellow-900">${escapeHtml(match[1] ?? '')}</mark>`
        : escapeHtml(part);
    })
    .join('');
}
