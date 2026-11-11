import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified, type Plugin } from 'unified';
import type { Heading, PhrasingContent, Root, RootContent } from 'mdast';

/** A heading the post page lists in its table of contents and anchors in its body. */
export interface MarkdownHeading {
  level: 2 | 3;
  text: string;
  id: string;
}

/**
 * Everything outside `[\w\s\u0600-\u06FF-]`, plus the Arabic punctuation,
 * tatweel and numeric symbols that range would otherwise let through, so a
 * heading's id never carries a character an `href` cannot address (#992).
 */
const NOT_AN_ID_CHARACTER = /[^\w\s\u0600-\u06FF-]/g;
const ARABIC_PUNCTUATION = /[\u060C\u061B\u061F\u0640\u066A-\u066D\u06D4]/g;

/** The one normaliser the contents list and the rendered heading both use. */
export function headingIdFromText(text: string): string {
  return text
    .toLowerCase()
    .replace(NOT_AN_ID_CHARACTER, '')
    .replace(ARABIC_PUNCTUATION, '')
    .replace(/\s+/g, '-');
}

/**
 * The text the renderer shows for a heading: inline Markdown contributes its
 * content, and a node drawn with no text of its own (an image, a hard break,
 * raw HTML, which the page renders without `rehype-raw`) contributes nothing.
 */
function flattenInline(children: readonly PhrasingContent[]): string {
  return children
    .map((child) => {
      switch (child.type) {
        case 'text':
        case 'inlineCode':
          return child.value;
        case 'image':
        case 'html':
        case 'break':
        case 'footnoteReference':
          return '';
        default:
          return 'children' in child ? flattenInline(child.children) : '';
      }
    })
    .join('');
}

/** Every heading in document order, a blockquote's or a list item's included. */
function forEachHeading(tree: Root, visit: (heading: Heading) => void): void {
  const stack: RootContent[] = [...tree.children].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === 'heading') {
      visit(node);
      continue;
    }
    if ('children' in node) {
      stack.push(...([...node.children].reverse() as RootContent[]));
    }
  }
}

/**
 * Gives every rendered `h2`/`h3` its anchor and returns the list in the same
 * order, so the contents list and the body come from one pass over one tree
 * rather than two scans that can disagree (#992).
 *
 * The id rides on `data.hProperties`, which `mdast-util-to-hast` — the step
 * inside `react-markdown` — turns into the element's `id` attribute.
 */
function assignHeadingIds(tree: Root): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const used = new Map<string, number>();
  forEachHeading(tree, (node) => {
    if (node.depth !== 2 && node.depth !== 3) return;
    const text = flattenInline(node.children).trim();
    const base = headingIdFromText(text) || 'heading';
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    const id = seen === 1 ? base : `${base}-${seen}`;
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    headings.push({ level: node.depth, text, id });
  });
  return headings;
}

const markdownParser = unified().use(remarkParse).use(remarkGfm);

/** The table of contents for a post, with the ids its headings will carry. */
export function markdownHeadings(markdown: string): MarkdownHeading[] {
  return assignHeadingIds(markdownParser.parse(markdown) as Root);
}

/** The render half of the pair: `rehype`-bound ids for the same headings. */
export const remarkHeadingIds: Plugin<[], Root> = () => (tree) => {
  assignHeadingIds(tree);
};
