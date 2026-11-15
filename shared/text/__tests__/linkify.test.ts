import { describe, expect, it } from 'vitest';

import { mentionedHandles, tokenizeText } from '@/shared/text/linkify';

/** A readable projection of the tokens, for assertions that are about boundaries. */
function shape(text: string) {
  return tokenizeText(text).map((token) =>
    token.kind === 'text'
      ? token.value
      : `[${token.kind}:${token.kind === 'url' ? token.href : token.handle}]`
  );
}

describe('tokenizeText — URLs', () => {
  it('links a scheme URL and leaves the sentence punctuation out', () => {
    expect(shape('اقرأ https://example.com/a?b=1.')).toEqual([
      'اقرأ ',
      '[url:https://example.com/a?b=1]',
      '.',
    ]);
  });

  it('gives a bare www host a scheme', () => {
    expect(shape('www.example.com')).toEqual(['[url:https://www.example.com]']);
  });

  it('links a bare domain with a known TLD and keeps its path', () => {
    expect(shape('example.com/docs')).toEqual(['[url:https://example.com/docs]']);
  });

  it('leaves versions, abbreviations and code files alone', () => {
    expect(shape('v1.2 e.g. node.js main.ts')).toEqual(['v1.2 e.g. node.js main.ts']);
  });

  it('keeps a parenthesis that opened inside the URL', () => {
    expect(shape('(see https://example.com/Foo_(bar))')).toEqual([
      '(see ',
      '[url:https://example.com/Foo_(bar)]',
      ')',
    ]);
  });

  it('does not link a scheme with nothing behind it', () => {
    expect(shape('https:// is not a link')).toEqual(['https:// is not a link']);
  });

  it('scans a subdomain as one address, from its first label', () => {
    expect(shape('docs.example.com/a')).toEqual(['[url:https://docs.example.com/a]']);
  });
});

describe('tokenizeText — handles', () => {
  it('reads an @handle at the start of the text', () => {
    expect(shape('@sara')).toEqual(['[mention:sara]']);
  });

  it('reads an @handle after a space and drops the comma', () => {
    expect(shape('مرحبا @sara, كيف حالك')).toEqual(['مرحبا ', '[mention:sara]', ', كيف حالك']);
  });

  it('reads an Arabic handle', () => {
    expect(shape('@سارة')).toEqual(['[mention:سارة]']);
  });

  it('does not read an email address as a handle', () => {
    expect(shape('write to name@example.com')).toEqual(['write to name@example.com']);
  });

  it('does not read a handle inside a URL', () => {
    expect(shape('https://example.com/@sara')).toEqual(['[url:https://example.com/@sara]']);
  });

  it('ignores a handle shorter than the schema allows', () => {
    expect(shape('@ab')).toEqual(['@ab']);
  });

  it('ignores a handle with an edge hyphen', () => {
    expect(shape('@-sara')).toEqual(['@-sara']);
  });

  it('lower-cases the handle it reports', () => {
    expect(shape('@Sara')).toEqual(['[mention:sara]']);
  });
});

describe('mentionedHandles', () => {
  it('lists each handle once, lower-cased, and none from URLs', () => {
    expect(mentionedHandles('@Sara @sara https://x.com/@nada @نور')).toEqual(['sara', 'نور']);
  });

  it('is empty for text with no mentions', () => {
    expect(mentionedHandles('لا شيء هنا')).toEqual([]);
  });
});
