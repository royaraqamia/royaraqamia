'use client';

import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { rowClasses } from '@/frontend/ui/account/row-classes';

interface AccountRowProps {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Replaces navigation for a visitor with no session — the row opens the prompt. */
  onRequireAuth: (href: string) => void;
}

/**
 * One account action row. The same row serves guests and members alike: a member
 * gets the link, a guest gets a button that hands its `href` to the prompt so
 * signing in can return them to the page they asked for. Nothing is hidden —
 * hiding a row only tells a visitor the feature is not for them.
 */
export function AccountRow({ href, icon: Icon, label, onRequireAuth }: AccountRowProps) {
  const { user, isLoading } = useSession();

  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 shrink-0 text-primary" />
        <span>{label}</span>
      </span>
      <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
        ←
      </span>
    </>
  );

  if (!user && !isLoading) {
    return (
      <button type="button" onClick={() => onRequireAuth(href)} className={rowClasses}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href} className={rowClasses}>
      {body}
    </Link>
  );
}
