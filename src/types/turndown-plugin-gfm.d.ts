// turndown-plugin-gfm ships no type definitions of its own, and there's no
// @types package for it — this is a minimal declaration covering the small
// slice of its API we actually use.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  type Plugin = (service: TurndownService) => void;

  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
}
