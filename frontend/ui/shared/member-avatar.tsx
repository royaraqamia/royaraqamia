import { User } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { BoundedImage } from '@/frontend/ui/shared/bounded-image';

export type MemberAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface SizeTokens {
  box: string;
  initial: string;
  icon: string;
}

const SIZES: Record<MemberAvatarSize, SizeTokens> = {
  xs: { box: 'size-7', initial: 'text-[11px]', icon: 'size-3.5' },
  sm: { box: 'size-9', initial: 'text-xs', icon: 'size-4' },
  md: { box: 'size-10', initial: 'text-sm', icon: 'size-4' },
  lg: { box: 'size-14', initial: 'text-lg', icon: 'size-6' },
  xl: { box: 'size-20', initial: 'text-2xl', icon: 'size-8' },
};

export interface MemberAvatarProps {
  name: string | null;
  avatarUrl: string | null;
  size?: MemberAvatarSize;
  /** The gradient presence ring. Quiet by default, brighter on group hover. */
  ring?: boolean;
  className?: string;
  sizes?: string;
  /** The member is inside the 60-second presence window (ADR 0212). */
  online?: boolean;
  /** The same state in words, for assistive technology — a dot is colour alone. */
  onlineLabel?: string;
}

/**
 * A community member's identity mark — the one recurring flourish of the
 * member surfaces. A violet→fuchsia→indigo ring (the same gradient the
 * section titles use) hugs the avatar so people scanning the page recognize
 * "member" at a glance.
 */
export function MemberAvatar({
  name,
  avatarUrl,
  size = 'md',
  ring = true,
  className,
  sizes = '80px',
  online = false,
  onlineLabel,
}: MemberAvatarProps) {
  const tokens = SIZES[size];
  const initial = name?.trim()?.charAt(0) ?? null;

  const content = (
    <span
      className={cn(
        'flex size-full items-center justify-center overflow-hidden rounded-full bg-muted/60 font-bold text-primary'
      )}
    >
      {avatarUrl?.trim() ? (
        <BoundedImage
          src={avatarUrl}
          alt={name ?? ''}
          width={96}
          height={96}
          sizes={sizes}
          className="size-full rounded-full object-cover"
        />
      ) : initial ? (
        <span aria-hidden="true" className={tokens.initial}>
          {initial}
        </span>
      ) : (
        <User className={cn('text-muted-foreground', tokens.icon)} aria-hidden="true" />
      )}
    </span>
  );

  const dot = online ? (
    <>
      <span
        aria-hidden="true"
        className="absolute bottom-0 end-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
      />
      {onlineLabel ? <span className="sr-only">{onlineLabel}</span> : null}
    </>
  ) : null;

  if (!ring) {
    return (
      <span className={cn('relative inline-flex shrink-0', tokens.box, className)}>
        {content}
        {dot}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 rounded-full bg-linear-to-br from-violet-500/50 via-fuchsia-500/40 to-indigo-500/50 p-[2px] transition-safe duration-300 group-hover:from-violet-400 group-hover:via-fuchsia-400 group-hover:to-indigo-400',
        tokens.box,
        className
      )}
    >
      <span className="flex size-full rounded-full bg-background p-[2px]">{content}</span>
      {dot}
    </span>
  );
}
