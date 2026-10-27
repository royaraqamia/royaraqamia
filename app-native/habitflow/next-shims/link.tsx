'use client';

/**
 * `next/link` for the bundled surface: an anchor whose click goes through the
 * spike router (`./navigation`) so the owned/remote split is decided in one
 * place instead of every call site.
 */

import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from 'react';

import { navigate } from './navigation';

export type UrlObject = {
  pathname?: string;
  query?: Record<string, string>;
  hash?: string;
};

export interface LinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  href: string | UrlObject;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  children?: ReactNode;
}

/** Format a Next-style href the way the stub's parser expects it. */
export function hrefToString(href: string | UrlObject): string {
  if (typeof href === 'string') return href;

  const query = href.query
    ? `?${new URLSearchParams(href.query as Record<string, string>).toString()}`
    : '';
  return `${href.pathname ?? '/'}${query}${href.hash ? `#${href.hash}` : ''}`;
}

export default function Link({ href, onClick, children, ...rest }: LinkProps) {
  const target = hrefToString(href);
  const { replace, scroll, prefetch, ...anchorProps } = rest;
  // Next's own-only props are read so the destructure stays honest under
  // `noUnusedLocals`; the stub has no cache to replace or prefetch.
  void replace;
  void scroll;
  void prefetch;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    navigate(target);
  }

  return (
    <a href={target} onClick={handleClick} {...anchorProps}>
      {children}
    </a>
  );
}
