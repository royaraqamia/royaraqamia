'use client';

import { useMemo } from 'react';

import { parseChatMarkdown, type ChatInline } from '@/shared/text/chat-markdown';
import { LinkifiedText } from '@/frontend/ui/shared/linkified-text';
import type { WebSource } from '@/shared/contracts/web-search';

/**
 * One message as the reader sees it: the inline marks the field wrote, the
 * addresses and handles the text holds, and its line breaks (ADR-0193).
 *
 * A web answer also carries numbered sources (ADR-0206). When they are passed
 * in, a `[2]` in the text becomes a link to the second row of that answer's
 * card; a stray number that names no source stays the plain text it was.
 */
export function ChatBody({
  text,
  sources,
  sourceAnchor,
}: {
  text: string;
  sources?: WebSource[] | null;
  /** Unique per bubble, so two answers cannot claim the same row. */
  sourceAnchor?: string;
}) {
  const nodes = useMemo(() => parseChatMarkdown(text), [text]);
  return <>{nodes.map((node, index) => renderInline(node, index, sources, sourceAnchor))}</>;
}

function renderInline(
  node: ChatInline,
  key: number,
  sources?: WebSource[] | null,
  sourceAnchor?: string
): React.ReactNode {
  if (node.kind === 'text') {
    if (!sources?.length || !sourceAnchor) return <LinkifiedText key={key} text={node.value} />;

    const parts = node.value.split(/(\[\d{1,2}\])/g);
    return (
      <>
        {parts.map((part, at) => {
          const match = /^\[(\d{1,2})\]$/.exec(part);
          const number = match ? Number(match[1]) : 0;
          if (number >= 1 && number <= sources.length) {
            return (
              <a
                key={`${key}-${at}`}
                href={`#${sourceAnchor}-${number}`}
                dir="ltr"
                className="font-medium text-primary underline underline-offset-2"
              >
                [{number}]
              </a>
            );
          }
          return <LinkifiedText key={`${key}-${at}`} text={part} />;
        })}
      </>
    );
  }
  if (node.kind === 'break') return <br key={key} />;

  if (node.kind === 'link') {
    return (
      <a
        key={key}
        href={node.href}
        dir="ltr"
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="font-medium underline underline-offset-2 decoration-1 break-words"
      >
        {node.children.map((child, index) => renderInline(child, index, sources, sourceAnchor))}
      </a>
    );
  }

  const children = node.children.map((child, index) =>
    renderInline(child, index, sources, sourceAnchor)
  );
  switch (node.mark) {
    case 'bold':
      return <strong key={key}>{children}</strong>;
    case 'italic':
      return <em key={key}>{children}</em>;
    case 'underline':
      return (
        <u key={key} className="underline underline-offset-2">
          {children}
        </u>
      );
    case 'strike':
      return <s key={key}>{children}</s>;
    default:
      return (
        <code
          key={key}
          dir="ltr"
          className="rounded bg-background/40 px-1 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]"
        >
          {children}
        </code>
      );
  }
}
