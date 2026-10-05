'use client';

import { Share2 } from 'lucide-react';

interface SocialShareProps {
  /** Absolute URL, or a site-relative path resolved against the current origin. */
  url: string;
  title: string;
}

export function SocialShare({ url, title }: SocialShareProps) {
  const resolveUrl = () => {
    try {
      return new URL(url, window.location.origin).toString();
    } catch {
      return url;
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resolveUrl());
    } catch {
      /* ignore */
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: resolveUrl() });
      } catch {
        /* ignore */
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleNativeShare}
        className="size-9 rounded-full bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-safe cursor-pointer"
        aria-label="مشاركة المنشور"
        title="مشاركة المنشور"
      >
        <Share2 className="size-4" />
      </button>
    </div>
  );
}
