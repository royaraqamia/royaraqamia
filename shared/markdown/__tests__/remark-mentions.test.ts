import { describe, expect, it } from 'vitest';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Root, RootContent } from 'mdast';

import { remarkMentions } from '@/shared/markdown/remark-mentions';

function tree(markdown: string, handles: string[]): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMentions, { handles: new Set(handles) });
  return processor.runSync(processor.parse(markdown)) as Root;
}

/** Every link in the tree, in document order. */
function links(node: Root | RootContent): Array<{ url: string; text: string }> {
  const found: Array<{ url: string; text: string }> = [];
  const stack: Array<Root | RootContent> = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.type === 'link') {
      found.push({
        url: current.url,
        text: current.children.map((child) => ('value' in child ? child.value : '')).join(''),
      });
      continue;
    }
    if ('children' in current) stack.push(...current.children);
  }
  return found;
}

/**
 * The post body's own half of ADR-0192: the tree the renderer draws, not the
 * HTML it produces afterwards.
 */
describe('remarkMentions', () => {
  it('links a handle a member answers for', () => {
    expect(links(tree('مرحبا @sara', ['sara']))).toEqual([{ url: '/u/sara', text: '@sara' }]);
  });

  it('leaves a handle nobody answers for as text', () => {
    expect(links(tree('مرحبا @nobody', ['sara']))).toEqual([]);
  });

  it('links a bare address GFM would leave as text', () => {
    expect(links(tree('see example.com/docs', []))).toEqual([
      { url: 'https://example.com/docs', text: 'example.com/docs' },
    ]);
  });

  it('does not touch code spans or fences', () => {
    expect(links(tree('`@sara` and\n\n```\n@sara\n```', ['sara']))).toEqual([]);
  });

  it('does not nest a link inside a link', () => {
    const found = links(tree('[@sara](/somewhere)', ['sara']));
    expect(found).toEqual([{ url: '/somewhere', text: '@sara' }]);
  });

  it('links a handle inside emphasis, which is still phrasing', () => {
    expect(links(tree('**@sara**', ['sara']))).toEqual([{ url: '/u/sara', text: '@sara' }]);
  });
});
