'use client';

import { Share2 } from 'lucide-react';

interface SocialShareProps {
  url: string;
  title: string;
}

export function SocialShare({ url, title }: SocialShareProps) {
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
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
        aria-label="مشاركة المقال"
        title="مشاركة المقال"
      >
        <Share2 className="size-4" />
      </button>
    </div>
  );
}
