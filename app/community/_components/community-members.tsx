import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import type { PublicUser } from '@/shared/contracts/users';

interface CommunityMembersProps {
  members: PublicUser[];
  /** Roster size, which may exceed the rows shown. */
  total: number;
}

function displayName(member: PublicUser): string {
  return member.name?.trim() || `@${member.username}`;
}

/**
 * Desktop rail of members. Reads as part of the feed's right column —
 * deliberately quiet chrome so the gradient avatars carry the identity.
 */
export function CommunityMembersPanel({ members, total }: CommunityMembersProps) {
  if (members.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/40 shadow-sm">
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-bold text-foreground">أعضاء المجتمع</h2>
        </div>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
          {total}
        </span>
      </header>

      <ul className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {members.map((member) => (
          <li key={member.id}>
            <Link
              href={`/u/${encodeURIComponent(member.username)}`}
              className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-safe duration-200 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            >
              <MemberAvatar
                name={member.name}
                avatarUrl={member.avatar_url}
                size="sm"
                sizes="36px"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">
                  {displayName(member)}
                </span>
                <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                  @{member.username}
                </span>
              </span>
              <ArrowLeft
                className="size-4 shrink-0 text-primary opacity-0 transition-safe duration-200 group-hover:translate-x-[-2px] group-hover:opacity-100"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mobile counterpart: a snap-scrolling row of member chips above the feed. */
export function CommunityMembersStrip({ members, total }: CommunityMembersProps) {
  if (members.length === 0) return null;

  return (
    <section className="mb-8 lg:hidden" aria-label="أعضاء المجتمع">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground">أعضاء المجتمع</h2>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
          {total}
        </span>
      </div>
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member) => (
          <li key={member.id} className="snap-start">
            <Link
              href={`/u/${encodeURIComponent(member.username)}`}
              className="group flex w-24 flex-col items-center gap-2 rounded-2xl border border-transparent p-2.5 text-center transition-safe duration-200 hover:border-border/60 hover:bg-muted/30 focus-visible:border-border/60 focus-visible:outline-none"
            >
              <MemberAvatar
                name={member.name}
                avatarUrl={member.avatar_url}
                size="lg"
                sizes="56px"
              />
              <span className="w-full truncate text-xs font-bold text-foreground">
                {displayName(member)}
              </span>
              <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">
                @{member.username}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
