import { describe, expect, it } from 'vitest';

import {
  chatDocToMarkdown,
  chatMarkdownToDoc,
  chatMarkdownToPlainText,
  parseChatMarkdown,
  type ChatInline,
} from '@/shared/text/chat-markdown';

/** A readable projection, for assertions about boundaries rather than shape. */
function shape(nodes: ChatInline[]): string[] {
  return nodes.map((node) => {
    if (node.kind === 'text') return node.value;
    if (node.kind === 'break') return '⏎';
    if (node.kind === 'link') return `link(${node.href})[${shape(node.children).join('')}]`;
    return `${node.mark}(${shape(node.children).join('')})`;
  });
}

describe('parseChatMarkdown', () => {
  it('reads bold, italic, underline, strike and code', () => {
    expect(shape(parseChatMarkdown('**عريض** *مائل* _مائل_ __تسطير__ ~~شطب~~ `كود`'))).toEqual([
      'bold(عريض)',
      ' ',
      'italic(مائل)',
      ' ',
      'italic(مائل)',
      ' ',
      'underline(تسطير)',
      ' ',
      'strike(شطب)',
      ' ',
      'code(كود)',
    ]);
  });

  it('keeps a newline as a break', () => {
    expect(shape(parseChatMarkdown('سطر\nثانٍ'))).toEqual(['سطر', '⏎', 'ثانٍ']);
  });

  it('reads a link and refuses a scheme that could execute', () => {
    expect(shape(parseChatMarkdown('[رفي](https://x.com)'))).toEqual(['link(https://x.com)[رفي]']);
    expect(shape(parseChatMarkdown('[رفي](javascript:alert(1))'))).toEqual([
      '[رفي](javascript:alert(1))',
    ]);
  });

  it('treats a code span literally', () => {
    expect(shape(parseChatMarkdown('`**not bold**`'))).toEqual(['code(**not bold**)']);
    expect(shape(parseChatMarkdown('`a*b`'))).toEqual(['code(a*b)']);
  });

  it('nests marks the way the field writes them', () => {
    expect(shape(parseChatMarkdown('**عريض _ومائل_**'))).toEqual(['bold(عريض italic(ومائل))']);
  });

  it('leaves an unmatched marker as the text it is', () => {
    expect(shape(parseChatMarkdown('2 * 3 = 6'))).toEqual(['2 * 3 = 6']);
    expect(shape(parseChatMarkdown('**بلا إغلاق'))).toEqual(['**بلا إغلاق']);
  });

  it('lets a mark span the lines it was written across', () => {
    // The field keeps marks open over Enter, so this is what bold-across-lines
    // is stored as.
    expect(shape(parseChatMarkdown('**سطر\nثانٍ**'))).toEqual(['bold(سطر⏎ثانٍ)']);
  });
});

describe('chatMarkdownToPlainText', () => {
  it('drops the markers and keeps the words', () => {
    expect(chatMarkdownToPlainText('**عريض** و`كود`\nسطر')).toBe('عريض وكود سطر');
  });
});

describe('the editor round trip', () => {
  const cases = [
    'مرحبا **بالعالم**',
    '_مائل_ و__مسطّر__ و~~مشطوب~~',
    '`const x = 1` ثم «اقتباس»',
    'سطر\nثانٍ',
    '[الرابط](https://example.com/a)',
    'نص **عريض _ومائل_** عادي',
  ];

  it.each(cases)('keeps %s', (markdown) => {
    expect(chatDocToMarkdown(chatMarkdownToDoc(markdown))).toBe(markdown);
  });

  it('round-trips an empty body', () => {
    expect(chatDocToMarkdown(chatMarkdownToDoc(''))).toBe('');
  });

  it('escapes text that would otherwise read as a marker', () => {
    const stored = chatDocToMarkdown(chatMarkdownToDoc('2 * 3 = 6'));
    expect(stored).toBe('2 \\* 3 = 6');
    // And the escape renders as the plain character the writer typed.
    expect(chatMarkdownToPlainText(stored)).toBe('2 * 3 = 6');
  });
});
