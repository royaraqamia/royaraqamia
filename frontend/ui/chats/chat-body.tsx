'use client';

import { useMemo } from 'react';

import { parseChatMarkdown, type ChatInline } from '@/shared/text/chat-markdown';
import { LinkifiedText } from '@/frontend/ui/shared/linkified-text';

/**
 * One message as the reader sees it: the inline marks the field wrote, the
 * addresses and handles the text holds, and its line breaks (ADR-0193).
 *
 * Text leaves go through `LinkifiedText`, so a message follows the same two
 * rules every other surface does (ADR-0192) — a URL is pressable, an `@handle`
 * is pressable only when the directory answers for it — and this file only owns
 * the marks on top of that.
 */
export function ChatBody({ text }: { text: string }) {
  const nodes = useMemo(() => parseChatMarkdown(text), [text]);
  return <>{nodes.map((node, index) => renderInline(node, index))}</>;
}

function renderInline(node: ChatInline, key: number): React.ReactNode {
  if (node.kind === 'text') return <LinkifiedText key={key} text={node.value} />;
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
        {node.children.map((child, index) => renderInline(child, index))}
      </a>
    );
  }

  const children = node.children.map((child, index) => renderInline(child, index));
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
