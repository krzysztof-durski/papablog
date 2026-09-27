import { describe, expect, it } from 'vitest';
import { snippetToHtml } from '../../../src/lib/format/snippetHtml';

describe('snippetToHtml', () => {
  it('wraps a bracketed match in a <mark> tag', () => {
    expect(snippetToHtml('a [match] here')).toBe('a <mark class="bg-yellow-200 dark:bg-yellow-900">match</mark> here');
  });

  it('handles multiple matches', () => {
    expect(snippetToHtml('[one] and [two]')).toBe(
      '<mark class="bg-yellow-200 dark:bg-yellow-900">one</mark> and <mark class="bg-yellow-200 dark:bg-yellow-900">two</mark>',
    );
  });

  it('escapes HTML special characters outside of matches', () => {
    expect(snippetToHtml('A <script>alert(1)</script> & "quote"')).toBe(
      'A &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;',
    );
  });

  it('escapes HTML special characters inside a match too', () => {
    expect(snippetToHtml('[<b>bold</b>]')).toBe(
      '<mark class="bg-yellow-200 dark:bg-yellow-900">&lt;b&gt;bold&lt;/b&gt;</mark>',
    );
  });

  it('passes plain text through unchanged (escaped identically)', () => {
    expect(snippetToHtml('no matches here')).toBe('no matches here');
  });
});
