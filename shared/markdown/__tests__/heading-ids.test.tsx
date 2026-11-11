import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import {
  headingIdFromText,
  markdownHeadings,
  remarkHeadingIds,
} from '@/shared/markdown/heading-ids';

/** The post page's own heading components, reduced to the id they read. */
function renderBody(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkHeadingIds]}
      components={{
        h2: ({ node, children }) => <h2 id={node?.properties?.id as string}>{children}</h2>,
        h3: ({ node, children }) => <h3 id={node?.properties?.id as string}>{children}</h3>,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function renderedIds(markup: string): string[] {
  return [...markup.matchAll(/<h[23] id="([^"]*)"/g)].map((match) => match[1] ?? '');
}

function contentsHrefs(markdown: string): string[] {
  return markdownHeadings(markdown).map((heading) => `#${heading.id}`);
}

/**
 * The contract #992 asks for: every contents row points at an id the body
 * really carries, and no two rows share one.
 */
function expectRowsToReachHeadings(markdown: string): void {
  const hrefs = contentsHrefs(markdown);
  const ids = renderedIds(renderBody(markdown));

  expect(new Set(ids).size).toBe(ids.length);
  expect(hrefs).toEqual(ids.map((id) => `#${id}`));
  expect(markdownHeadings(markdown).map((heading) => heading.text).length).toBe(hrefs.length);
}

describe('headingIdFromText', () => {
  it('drops the Arabic punctuation an href cannot address', () => {
    expect(headingIdFromText('ما هو الذكاء الاصطناعي؟')).toBe('ما-هو-الذكاء-الاصطناعي');
    expect(headingIdFromText('الخطوات: أولاً، ثانياً؛ ثم')).toBe('الخطوات-أولاً-ثانياً-ثم');
    expect(headingIdFromText('الخط العربي ـ المتصل')).toBe('الخط-العربي-المتصل');
  });
});

describe('markdownHeadings', () => {
  it('reads the same text and id the rendered heading draws', () => {
    const markdown = [
      '## ما هو الذكاء الاصطناعي؟',
      '',
      '## الخطوات: أولاً، ثانياً',
      '',
      '### `كود` و **نص**',
    ].join('\n');

    const headings = markdownHeadings(markdown);
    expect(headings.map((heading) => heading.text)).toEqual([
      'ما هو الذكاء الاصطناعي؟',
      'الخطوات: أولاً، ثانياً',
      'كود و نص',
    ]);
    expect(headings[0]?.id).toBe('ما-هو-الذكاء-الاصطناعي');
    expectRowsToReachHeadings(markdown);
  });

  it('ignores a comment line inside a fenced block', () => {
    const markdown = [
      '## عنوان',
      '',
      '```bash',
      '# install the dependencies',
      '## and then',
      '```',
      '',
      '~~~',
      '# tilde fence',
      '~~~',
      '',
      '## عنوان آخر',
    ].join('\n');

    expect(markdownHeadings(markdown).map((heading) => heading.text)).toEqual([
      'عنوان',
      'عنوان آخر',
    ]);
    expectRowsToReachHeadings(markdown);
  });

  it('lists no level-1 heading', () => {
    const markdown = ['# مقدمة', '', '## الأول', '', '### الثاني'].join('\n');

    expect(markdownHeadings(markdown).map((heading) => heading.level)).toEqual([2, 3]);
    // The page keeps a level-1 heading as prose: it draws no anchor, and the
    // contents list does not offer a row that could not reach it.
    expect(renderBody(markdown)).toContain('<h1>مقدمة</h1>');
    expect(contentsHrefs(markdown)).not.toContain('#مقدمة');
    expectRowsToReachHeadings(markdown);
  });

  it('gives repeated heading text distinct ids in document order', () => {
    const markdown = [
      '## نفس العنوان',
      '',
      'فقرة',
      '',
      '## نفس العنوان',
      '',
      '## نفس العنوان',
    ].join('\n');

    expect(markdownHeadings(markdown).map((heading) => heading.id)).toEqual([
      'نفس-العنوان',
      'نفس-العنوان-2',
      'نفس-العنوان-3',
    ]);
    expectRowsToReachHeadings(markdown);
  });
});
