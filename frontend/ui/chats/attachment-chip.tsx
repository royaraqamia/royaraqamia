'use client';

import { Download } from 'lucide-react';

import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import type { ChatAttachment } from '@/shared/contracts/chat';

/**
 * A file in the bubble, as a chip (ADR-0113, ADR-0127).
 *
 * It is the shape of everything that is not played or drawn — a PDF, an
 * archive, a document — and the picture that has not loaded yet, so a thread
 * never jumps from nothing to a photo. The sentence it reads out is the
 * thread's own copy, handed in, because `chat-thread.json` is rendered by the
 * thread view (ADR-0098).
 */
export function AttachmentChip({
  attachment,
  label,
  onDownload,
}: {
  attachment: ChatAttachment;
  /** The whole download sentence, with this file's name already in it. */
  label: string;
  onDownload: (attachment: ChatAttachment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onDownload(attachment)}
      className="flex w-full items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1 text-right text-[11px] hover:bg-background/30"
      aria-label={label}
    >
      <Download size={12} className="shrink-0" />
      <span className="max-w-48 truncate">{attachment.fileName}</span>
      <span className="shrink-0 opacity-70">{formatAttachmentSize(attachment.byteSize)}</span>
    </button>
  );
}
