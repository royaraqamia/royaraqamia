import type { Link, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { Plugin } from 'unified';

import { tokenizeText } from '@/shared/text/linkify';

/**
 * The post body's `@handles` and bare addresses, as links (ADR-0192).
 *
 * A Markdown document is parsed before it is drawn, so the honest place to make
 * a handle pressable is the tree, not the HTML: this runs on the mdast the
 * renderer is about to draw and replaces one text node with the run of text and
 * links it holds. Nothing downstream has to know that the body had mentions.
 *
 * What it will not touch: a code span or a fence (the words there are the
 * author's source), raw HTML, and anything already inside a link — a link inside
 * a link is not a thing the browser can draw.
 *
 * The set of handles is an argument rather than a lookup, because the caller owns
 * the one question this cannot answer: whether the member exists. An unknown
 * handle stays text, the same way it does on every other surface.
 */
export interface RemarkMentionsOptions {
  /** Handles that name a listed member, lower-cased. */
  handles: ReadonlySet<string>;
}

/** Containers whose children are phrasing: everything else is walked into. */
const INLINE_CONTAINERS = new Set([
  'paragraph',
  'heading',
  'emphasis',
  'strong',
  'delete',
  'link',
  'tableCell',
  'footnoteDefinition',
]);

const NEVER_SPLIT = new Set(['code', 'inlineCode', 'html', 'link', 'linkReference']);

function linkNode(value: string, href: string, ltr = false): Link {
  return {
    type: 'link',
    url: href,
    title: null,
    ...(ltr ? { data: { hProperties: { dir: 'ltr' } } } : {}),
    children: [{ type: 'text', value }],
  };
}

function splitText(value: string, handles: ReadonlySet<string>): PhrasingContent[] | null {
  const tokens = tokenizeText(value);
  if (tokens.every((token) => token.kind === 'text')) return null;

  return tokens.map((token): PhrasingContent => {
    if (token.kind === 'url') return linkNode(token.value, token.href);
    if (token.kind === 'mention' && handles.has(token.handle)) {
      // `dir` isolates the handle: inside an Arabic sentence `@sara` is one
      // left-to-right run, so the `@` stays at its start instead of jumping to
      // the right edge of the name.
      return linkNode(token.value, `/u/${encodeURIComponent(token.handle)}`, true);
    }
    return { type: 'text', value: token.value } satisfies Text;
  });
}

export const remarkMentions: Plugin<[RemarkMentionsOptions], Root> =
  ({ handles }) =>
  (tree) => {
    const stack: RootContent[] = [...tree.children];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || NEVER_SPLIT.has(node.type)) continue;
      if (!('children' in node)) continue;

      if (INLINE_CONTAINERS.has(node.type)) {
        const next: PhrasingContent[] = [];
        for (const child of node.children as PhrasingContent[]) {
          if (child.type !== 'text') {
            next.push(child);
            // A nested inline container (emphasis, a table cell) keeps its own walk.
            if ('children' in child) stack.push(child as RootContent);
            continue;
          }
          const split = splitText(child.value, handles);
          if (split) next.push(...split);
          else next.push(child);
        }
        node.children = next as typeof node.children;
        continue;
      }

      stack.push(...(node.children as RootContent[]));
    }
  };
