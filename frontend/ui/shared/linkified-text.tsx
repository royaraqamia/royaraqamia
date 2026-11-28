'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';

import { tokenizeText } from '@/shared/text/linkify';
import { useMentionHandles } from '@/frontend/state/usernames/use-mention-handles';
import { DismissThenNavigateLink } from '@/frontend/ui/shared/dismiss-then-navigate';

/** The one anchor style, written once: this file carries no class-merge helper. */
const ANCHOR =
  'font-medium underline underline-offset-2 decoration-1 break-words [overflow-wrap:anywhere]';

/**
 * Written text with its links and its handles pressable (ADR-0192).
 *
 * The tokens come from `shared/text/linkify`, so a chat bubble, a bio and a post
 * excerpt agree about what a URL is; the handles come from one batched read, so a
 * `@name` is a link only when there is a profile behind it. Until the read answers
 * the handle is the text the writer typed — the underline appears, nothing moves.
 *
 * It renders a fragment, not a block: every caller already owns the paragraph,
 * the line height and `whitespace-pre-wrap`, and a component that wrapped would
 * change the line breaks the writer made.
 */
export function LinkifiedText({
  text,
  linkClassName,
  /** The text is an excerpt cut with `…`: a link cut in half is not a link. */
  truncated = false,
  /**
   * The surface this text sits in is an overlay that has to close first (the
   * floating assistant panel, ADR-0150): a handle's own navigation would
   * otherwise leave the sheet open over the page it just pushed.
   */
  dismissOnNavigate,
}: {
  text: string;
  /** Applied to every anchor, for a surface that stacks above an overlay link. */
  linkClassName?: string;
  truncated?: boolean;
  dismissOnNavigate?: () => void;
}) {
  const tokens = useMemo(() => tokenizeText(text), [text]);
  const handles = useMemo(
    () => tokens.flatMap((token) => (token.kind === 'mention' ? [token.handle] : [])),
    [tokens]
  );
  const known = useMentionHandles(handles);

  const last = useMemo(() => {
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (tokens[index]?.kind !== 'text') return index;
    }
    return -1;
  }, [tokens]);

  /**
   * An excerpt that ends in the middle of a link shows that link as text: a
   * press that leads to half an address is worse than no press. The ellipsis the
   * excerpt is cut with is the only thing allowed after it.
   */
  const cut = useMemo(
    () =>
      truncated &&
      text.trimEnd().endsWith('…') &&
      last >= 0 &&
      tokens
        .slice(last + 1)
        .every((token) => token.kind === 'text' && /^[\s…]*$/.test(token.value)),
    [last, text, tokens, truncated]
  );

  const anchorClass = linkClassName ? `${ANCHOR} ${linkClassName}` : ANCHOR;

  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === 'text' || (cut && index === last)) {
          return <Fragment key={index}>{token.value}</Fragment>;
        }

        if (token.kind === 'url') {
          return (
            <a
              key={index}
              href={token.href}
              // An address is a left-to-right run even inside an Arabic sentence;
              // `dir` isolates it, so the `@` and the dots stay where the address
              // puts them instead of migrating to the paragraph's edge.
              dir="ltr"
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className={anchorClass}
            >
              {token.value}
            </a>
          );
        }

        if (!known.has(token.handle)) {
          // Unresolved, still isolated: an Arabic sentence must not turn `@sara`
          // into `sara@` just because the name happens to be a stranger's.
          return (
            <bdi key={index} dir="ltr">
              {token.value}
            </bdi>
          );
        }

        const href = `/u/${encodeURIComponent(token.handle)}`;
        // The overlay variant is a different component because the dismissal
        // needs the router, and a surface that is not an overlay (a bubble on
        // the thread page) must not pay for a router it never uses.
        if (dismissOnNavigate) {
          return (
            <DismissThenNavigateLink
              key={index}
              href={href}
              dismiss={dismissOnNavigate}
              dir="ltr"
              className={anchorClass}
            >
              {token.value}
            </DismissThenNavigateLink>
          );
        }

        return (
          <Link key={index} href={href} dir="ltr" className={anchorClass}>
            {token.value}
          </Link>
        );
      })}
    </>
  );
}
