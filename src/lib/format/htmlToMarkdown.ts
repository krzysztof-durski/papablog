import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Only ever runs in the browser (called from the admin editor's paste
 * handler) — Turndown needs a real DOM to parse the clipboard HTML, which
 * this Worker/Vitest runtime doesn't have.
 */
function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    bulletListMarker: '-',
  });
  service.use(gfm);

  // Google Docs wraps its entire clipboard payload in a
  // <b style="font-weight:normal" id="docs-internal-guid-…"> tag to reset
  // the default weight — Turndown's default <b> rule only looks at the tag
  // name, so without this the whole paste would come out wrapped in **.
  service.addRule('googleDocsNormalWeightWrapper', {
    filter: (node) => (node.nodeName === 'B' || node.nodeName === 'STRONG') && isNormalWeight(node),
    replacement: (content) => content,
  });

  // Google Docs expresses bold/italic as inline `style` on a <span> rather
  // than semantic <b>/<strong>/<i>/<em> tags, which Turndown's default rules
  // don't look at — without this, pasted formatting silently disappears.
  service.addRule('googleDocsBold', {
    filter: isBoldSpan,
    replacement: (content) => (content.trim() ? `**${content}**` : content),
  });
  service.addRule('googleDocsItalic', {
    filter: isItalicSpan,
    replacement: (content) => (content.trim() ? `_${content}_` : content),
  });

  // Google Docs doesn't emit semantic <h1>-<h6> tags for headings — a
  // "Heading 1" paragraph style comes through as a <p> whose entire content
  // is one large-font <span>. This maps that font-size convention back to
  // Markdown headings; anything not matching the pattern falls through to
  // Turndown's normal paragraph handling.
  service.addRule('googleDocsHeading', {
    filter: (node) => headingLevelFromParagraph(node) !== null,
    replacement: (content, node) => {
      const level = headingLevelFromParagraph(node) ?? 1;
      return `\n\n${'#'.repeat(level)} ${content.trim()}\n\n`;
    },
  });

  return service;
}

function isNormalWeight(node: HTMLElement): boolean {
  const weight = node.style.fontWeight;
  return weight === 'normal' || weight === '400';
}

function isBoldSpan(node: HTMLElement): boolean {
  if (node.nodeName !== 'SPAN') return false;
  const weight = node.style.fontWeight;
  return weight === 'bold' || Number(weight) >= 700;
}

function isItalicSpan(node: HTMLElement): boolean {
  return node.nodeName === 'SPAN' && node.style.fontStyle === 'italic';
}

/** A paragraph counts as a heading only when a single span carrying a large font-size accounts for its entire text content — anything looser risks mislabeling normal bold text as a heading. */
function headingLevelFromParagraph(node: HTMLElement): number | null {
  if (node.nodeName !== 'P') return null;

  const span = node.firstElementChild;
  if (!span || span.nodeName !== 'SPAN' || span !== node.lastElementChild) return null;
  if (span.textContent.trim() !== node.textContent.trim()) return null;

  const fontSize = parseFloat((span as HTMLElement).style.fontSize);
  if (Number.isNaN(fontSize)) return null;
  if (fontSize >= 20) return 1;
  if (fontSize >= 16) return 2;
  if (fontSize >= 14) return 3;
  return null;
}

export function htmlToMarkdown(html: string): string {
  return createTurndownService().turndown(html);
}
