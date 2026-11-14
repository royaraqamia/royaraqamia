import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import NotFound, { metadata } from '../not-found';

/**
 * Collects the type of every element the component returns. jsdom strips a
 * nested `<html>`/`<body>` before it can be queried, so the tree the component
 * hands React — not the DOM it lands in — is what a regression shows up in.
 */
function elementTypes(node: React.ReactNode, acc: unknown[] = []): unknown[] {
  if (node === null || node === undefined || typeof node !== 'object') return acc;

  if (Array.isArray(node)) {
    for (const child of node) elementTypes(child, acc);
    return acc;
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  acc.push(element.type);
  elementTypes(element.props?.children, acc);
  return acc;
}

/**
 * This segment renders *inside* `app/layout.tsx`, which already owns `<html>`,
 * `<body>`, `dir`, `lang` and the theme class. Returning a document here nested
 * a second one in the first and React reported it on every 404.
 */
describe('root not-found', () => {
  it('returns a subtree, not a second document', () => {
    const types = elementTypes(NotFound());

    expect(types).not.toContain('html');
    expect(types).not.toContain('body');
  });

  it('keeps the card, the skip-link target and the way home', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: /العودة إلى الرَّئيسيَّة/ })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('keeps its own title and description, without repeating the site name', () => {
    expect(metadata.title).toBe('404 - الصَّفحة غير موجودة');
    expect(String(metadata.description)).toContain('غير موجودة');
  });
});
