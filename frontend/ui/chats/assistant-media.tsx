'use client';

import { CHAT_MEDIA_ALT, type ChatMedia } from '@/shared/contracts/chat-media';

/**
 * A picture or clip a member generated through a connected app (ADR-0216).
 *
 * Native browser elements, nothing else: the URL is a same-origin route that
 * mints a fresh signed URL for our own bucket on every read, so there is no
 * vendor token in the page and a thread reopened tomorrow draws the same file.
 * The Android shell is a WebView of this document, so this one renderer is what
 * both clients show and no native port is needed.
 */
export function AssistantMedia({ media }: { media: ChatMedia | null | undefined }) {
  if (!media) return null;
  const alt = CHAT_MEDIA_ALT[media.kind];

  return (
    <figure className="mt-2">
      {media.kind === 'video' ? (
        <video
          src={media.url}
          controls
          preload="metadata"
          playsInline
          aria-label={alt}
          className="max-h-72 w-full rounded-lg border border-border/50"
        />
      ) : (
        <img
          src={media.url}
          alt={alt}
          loading="lazy"
          className="max-h-72 w-auto max-w-full rounded-lg border border-border/50 object-contain"
        />
      )}
    </figure>
  );
}
