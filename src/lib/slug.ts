const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;

/**
 * Converts a title into a URL- and filesystem-safe slug. This becomes both
 * the post's public URL path AND a GitHub file path component
 * (src/content/posts/<slug>.md) — the one place a client-influenced value
 * turns directly into a repo path, so it is always re-derived and validated
 * server-side (see isValidSlug) regardless of what a client sends.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, ''); // slice() may leave a trailing hyphen at the cut point
}

/** Strict allow-list check — the only thing the publish route trusts before using a slug as a file path segment. */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}
