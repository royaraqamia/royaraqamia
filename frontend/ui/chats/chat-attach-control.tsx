'use client';

import { useRef } from 'react';
import { Mic, Paperclip, X } from 'lucide-react';

import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { CHAT_VOICE_NOTE_SAMPLE_RATE, chatAttachmentIsAudio } from '@/shared/contracts/chat';
import { CHAT_COMPOSE_ATTACHMENTS_COPY } from './chat-compose-attachments-copy';
import { formatVoiceDuration, VOICE_COPY } from './voice-copy';

/**
 * The composer's attachment control (ADR-0127, #933).
 *
 * Two pieces that belong to one thing: the staged files above the field, and the
 * paperclip inside it. They live together because they share the words — the
 * paperclip's name and a chip's removal label come from
 * `shared/copy/chat-compose-attachments.json`, the same source that generates
 * the app's `ChatComposeAttachmentsCopy`, so the app's control cannot be worded
 * differently from the site's.
 */
export function ChatStagedFiles({
  files,
  onRemoveFile,
}: {
  files: File[];
  onRemoveFile: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="flex max-w-64 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
        >
          {chatAttachmentIsAudio(file.type) ? (
            <Mic size={11} className="shrink-0" aria-hidden />
          ) : (
            <Paperclip size={11} className="shrink-0" aria-hidden />
          )}
          <span className="min-w-0 truncate">
            {chatAttachmentIsAudio(file.type) ? VOICE_COPY.voiceNote : file.name}
          </span>
          <span className="shrink-0 text-muted-foreground/70">
            {chatAttachmentIsAudio(file.type)
              ? formatVoiceDuration(wavDurationMs(file.size))
              : formatAttachmentSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => onRemoveFile(index)}
            aria-label={CHAT_COMPOSE_ATTACHMENTS_COPY.removeFile.replace('{name}', file.name)}
            className="shrink-0 rounded p-0.5 hover:text-destructive"
          >
            <X size={11} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The paperclip and the picker it opens. It is placed inside the field by its
 * caller, which is why the position is a class rather than this component's
 * layout.
 */
export function ChatAttachButton({
  onAddFiles,
  disabled,
  className,
}: {
  onAddFiles: (files: File[]) => void;
  disabled: boolean;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          onAddFiles(Array.from(event.target.files ?? []));
          // Reset so picking the same file twice still fires a change.
          event.target.value = '';
        }}
      />
      <button
        type="button"
        aria-label={CHAT_COMPOSE_ATTACHMENTS_COPY.attach}
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className={className}
      >
        <Paperclip size={16} />
      </button>
    </>
  );
}

/**
 * A WAV's length from its size alone: 24 kHz mono, 16 bits. The staged chip can
 * therefore show a duration before anything has decoded it.
 */
function wavDurationMs(bytes: number): number {
  return (bytes / (CHAT_VOICE_NOTE_SAMPLE_RATE * 2)) * 1_000;
}
