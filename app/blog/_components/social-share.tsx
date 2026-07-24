'use client';

import { useState } from 'react';
import { Link, Check, Share2 } from 'lucide-react';

interface SocialShareProps {
  url: string;
  title: string;
}

export function SocialShare({ url, title }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleNativeShare}
        className="size-9 rounded-xl bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-all cursor-pointer"
        aria-label="مشاركة المقال"
        title="مشاركة المقال"
      >
        <Share2 className="size-4" />
      </button>
      <a
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="size-9 rounded-xl bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-all"
        aria-label="مشاركة على Telegram"
        title="مشاركة على Telegram"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.48-1.02-2.4-1.63-1.06-.7.11-1.09.68-1.69.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.06-.14-.04-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.4-1.08.39-.35-.01-1.03-.2-1.54-.35-.62-.18-1.12-.28-1.08-.59.02-.16.24-.32.66-.49 2.58-1.12 4.31-1.87 5.18-2.22 2.48-1.03 2.99-1.21 3.32-1.21.07 0 .24.02.35.12.09.08.11.19.12.27 0 .1.01.21 0 .23z" />
        </svg>
      </a>
      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="size-9 rounded-xl bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-all"
        aria-label="مشاركة على WhatsApp"
        title="مشاركة على WhatsApp"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
      <button
        onClick={handleCopyLink}
        className="size-9 rounded-xl bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-all cursor-pointer"
        aria-label={copied ? 'تم نسخ الرابط' : 'نسخ الرابط'}
        title={copied ? 'تم نسخ الرابط' : 'نسخ الرابط'}
      >
        {copied ? <Check className="size-4 text-success" /> : <Link className="size-4" />}
      </button>
    </div>
  );
}
