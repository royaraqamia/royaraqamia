'use client';

import { useRef, type ReactNode } from 'react';
import { Paperclip, X } from 'lucide-react';

import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { Button } from '@/frontend/ui/primitives/button';

/**
 * The composer's file half: the chips for the files staged for this message and
 * the control that stages them (#819, ADR-0113).
 *
 * It is its own component because the app's composer is text only for now:
 * attachments follow their own stage, so the web's attach control is the thing
 * that stage ports, and the member thread the app draws is the thread without
 * it. `children` is the composer's row — the textarea and the send button — so
 * the control sits where the page draws it rather than beside a second layout.
 */
export function ChatComposeAttachments({
  files,
  disabled,
  onAdd,
  onRemove,
  children,
}: {
  files: File[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  children: ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex max-w-64 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
            >
              <Paperclip size={11} className="shrink-0" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground/70">
                {formatAttachmentSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`إزالة ${file.name}`}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            // Reset so picking the same file twice still fires a change.
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="إرفاق ملف"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={16} />
        </Button>

        {children}
      </div>
    </>
  );
}
