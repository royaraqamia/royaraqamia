'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { actionCellClass } from './post-action-cell';

interface SocialShareProps {
  /** Absolute URL, or a site-relative path resolved against the current origin. */
  url: string;
  title: string;
  /** The control's accessible name, owned by the host's copy source. */
  label: string;
  /** The host's control classes: the bar's one cell shape (#1573). */
  className?: string;
}

/**
 * Share, in the host's control family.
 *
 * It started as a 36px filled disc beside 44px bare cells, which made one row
 * speak two visual languages. It now takes the host's classes and is a cell like
 * every other action; the only thing that sets it apart is the moment it
 * succeeds, when the glyph becomes a check for a beat.
 */
export function SocialShare({ url, title, label, className }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const resolveUrl = () => {
    try {
      return new URL(url, window.location.origin).toString();
    } catch {
      return url;
    }
  };

  const markCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resolveUrl());
      markCopied();
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
      await handleCopyLink();
    }
  };

  return (
    <button
      type="button"
      onClick={handleNativeShare}
      className={cn(actionCellClass(className))}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <Check className="size-[18px] text-primary" aria-hidden="true" />
      ) : (
        <Share2 className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
