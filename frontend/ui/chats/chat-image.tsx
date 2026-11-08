'use client';

import { useEffect, useState } from 'react';

import { getChatAttachmentUrl } from '@/frontend/api/chats';
import type { ChatAttachment } from '@/shared/contracts/chat';
import { AttachmentChip } from './attachment-chip';

/**
 * A picture, drawn where it sits (ADR-0139).
 *
 * The member attached it to ask about it, so the thread shows the picture the
 * assistant read rather than a file name they have to open to recognise. The
 * bytes are asked for on mount, through the same reader a chip downloads with
 * (#1033: the device's copy when it has one, the server's otherwise), and the
 * chip stands in until they arrive — and stays if they never do, so an image
 * that cannot be read is still a file the member can open.
 *
 * A picture is drawn on the screen only: the assistant's history stays text,
 * so an old image is not sent to the model again on every later question.
 */
export function ChatImage({
  conversationId,
  attachment,
  label,
  onDownload,
  resolveUrl,
}: {
  conversationId: string;
  attachment: ChatAttachment;
  /** The thread's download sentence, with this file's name already in it. */
  label: string;
  onDownload: (attachment: ChatAttachment) => void;
  /** Where this picture's bytes come from: the device's copy, else the server's. */
  resolveUrl?: (attachment: ChatAttachment) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const source = resolveUrl
          ? await resolveUrl(attachment)
          : ((await getChatAttachmentUrl(conversationId, attachment.id))?.url ?? null);
        if (live && source) setUrl(source);
      } catch {
        // The chip below is the answer: a picture that will not load is still
        // a file, and the download path already exists.
      }
    })();

    return () => {
      live = false;
    };
  }, [attachment, conversationId, resolveUrl]);

  if (!url) return <AttachmentChip attachment={attachment} label={label} onDownload={onDownload} />;

  return (
    <button
      type="button"
      onClick={() => onDownload(attachment)}
      className="block overflow-hidden rounded-lg bg-background/20"
      aria-label={label}
    >
      {/* A plain `<img>`: the URL is a short-lived signed one, or a blob the
          device already holds, so there is nothing for an optimiser to fetch
          ahead of time and a second copy would mean a second expiry. */}
      <img
        src={url}
        alt={attachment.fileName}
        loading="lazy"
        className="max-h-64 w-auto max-w-full object-contain"
      />
    </button>
  );
}
