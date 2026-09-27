import type { Frontmatter } from '../schemas/frontmatter';

/** Always double-quoted and escaped rather than relying on YAML's unquoted-scalar rules — colons, quotes, and leading punctuation all carry special meaning unquoted, so this is the simplest way to be unambiguously safe for arbitrary title/tag text. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Assembles the final markdown file (YAML frontmatter + body) committed to src/content/posts/<slug>.md. */
export function buildPostFileContent(frontmatter: Frontmatter, bodyMarkdown: string): string {
  const lines = [
    `title: ${yamlString(frontmatter.title)}`,
    `description: ${yamlString(frontmatter.description)}`,
    `publishDate: ${toDateOnly(frontmatter.publishDate)}`,
    frontmatter.updatedDate ? `updatedDate: ${toDateOnly(frontmatter.updatedDate)}` : null,
    `tags: [${frontmatter.tags.map(yamlString).join(', ')}]`,
    frontmatter.coverImage ? `coverImage: ${yamlString(frontmatter.coverImage)}` : null,
    frontmatter.coverImageAlt ? `coverImageAlt: ${yamlString(frontmatter.coverImageAlt)}` : null,
    `draft: ${String(frontmatter.draft)}`,
  ].filter((line): line is string => line !== null);

  return `---\n${lines.join('\n')}\n---\n\n${bodyMarkdown.trim()}\n`;
}
