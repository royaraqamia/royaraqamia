import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { postExcerpt, stripMarkdown } from '@/shared/reading-time';

/**
 * The post card's text, from the web side (#658).
 *
 * The card shows a post body as plain text and derives its label from it, and
 * the app draws the same card from the same markdown. The stripping rules are a
 * pipeline of replacements, which is exactly the kind of thing two clients
 * implement slightly differently: the shared fixture is what the site computes,
 * and the app's `PostTextFixtureTest` proves the Kotlin computes it too, so a
 * body the site shows in full and the app cuts is a red test rather than a
 * difference a reader has to notice (ADR-0098).
 */

type Case = {
  name: string;
  markdown: string;
  fallback: string;
  stripped: string;
  excerpt: string;
};

const FIXTURE = JSON.parse(
  readFileSync(resolve(process.cwd(), 'shared/fixtures/parity/post-text.json'), 'utf8')
) as { cases: Case[] };

describe('the pinned post text', () => {
  it('is not empty', () => {
    expect(FIXTURE.cases.length).toBeGreaterThan(0);
  });

  it.each(FIXTURE.cases)('$name strips to what the app will draw', ({ markdown, stripped }) => {
    expect(stripMarkdown(markdown)).toBe(stripped);
  });

  it.each(FIXTURE.cases)('$name is excerpted the same way', ({ markdown, fallback, excerpt }) => {
    expect(postExcerpt(markdown, fallback)).toBe(excerpt);
  });

  it('ellipsises a body past the label length', () => {
    const long = FIXTURE.cases.find((entry) => entry.stripped.length > 160);
    expect(long, 'the fixture set needs a body past 160 characters').toBeDefined();
    expect(long?.excerpt.endsWith('…')).toBe(true);
  });
});
