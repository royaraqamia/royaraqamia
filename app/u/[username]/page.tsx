import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { loadCommunityMember, loadCommunityMembers } from '@/backend/loaders/community';
import { loadFollowCounts } from '@/backend/loaders/follows';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FollowButton } from '@/frontend/ui/shared/follow-button';
import { FollowCountsBar } from '@/frontend/ui/shared/follow-counts';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { PostCard } from '@/app/community/_components/post-card';
import { MemberChatCta } from '@/app/community/_components/member-chat-cta';
import { PROFILE_COPY } from './profile-copy';

export const revalidate = 300;

/**
 * Members the build draws up front: the roster itself, i.e. the profiles
 * `/community` links to and the newest ones a visitor arrives from. It is a cap
 * rather than "everyone" because build time grows with it, and a profile nobody
 * has opened yet is worth one render, not a permanent build cost.
 *
 * `dynamicParams` stays on (the default, named here so the intent is not a
 * default by accident): a handle outside this set — a member who joined after
 * the build, or one past the roster — renders on its first visit and is cached
 * from then on, so the page is real ISR rather than `ƒ` for the whole directory.
 */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<Array<{ username: string }>> {
  const members = await loadCommunityMembers();
  // Handles may be Arabic: the prerendered key is the percent-encoded path the
  // site's own links and `sitemap.ts` use, which is the form the request carries.
  return members.map((member) => ({ username: encodeURIComponent(member.username) }));
}

function displayName(member: { name: string | null; username: string }): string {
  return member.name?.trim() || `@${member.username}`;
}

/** Handles may be Arabic, so the href is percent-encoded; accept both forms. */
function decodeHandle(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const page = await loadCommunityMember(decodeHandle(username));

  if (!page) {
    return {
      title: PROFILE_COPY.notFoundTitle,
      description: PROFILE_COPY.notFoundBody,
    };
  }

  const name = displayName(page.member);
  return {
    title: name,
    description: page.member.bio?.trim() || `منشورات ${name} على مجتمع رؤيَة رقَميَّة.`,
    alternates: { canonical: `/u/${page.member.username}` },
  };
}

export default async function MemberProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const page = await loadCommunityMember(decodeHandle(username));

  if (!page) notFound();

  const { member, posts } = page;
  const name = displayName(member);
  const counts = await loadFollowCounts(member.id);

  return (
    <div className="mx-auto max-w-4xl">
      <header
        data-visual="profile-header"
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 shadow-sm sm:p-8"
      >
        <span
          className="glow-orb pointer-events-none absolute -top-16 inset-e-[-10%] h-48 w-48 text-violet-500/20"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <MemberAvatar
            name={member.name}
            avatarUrl={member.avatar_url}
            size="xl"
            sizes="80px"
            className="group"
          />
          <div className="min-w-0">
            <h1
              data-visual="profile-name"
              className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              {name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              @{member.username}
            </p>
            <FollowCountsBar username={member.username} counts={counts} />
            {member.bio?.trim() && (
              <p className="mx-auto mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {member.bio}
              </p>
            )}
            {/* The button and the chat door sit on one line: both are "what you
                can do about this member", and the follower counts above them are
                the same relationship counted. */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <FollowButton username={member.username} name={member.name} />
              <MemberChatCta username={member.username} />
            </div>
          </div>
        </div>
      </header>

      <section className="mt-10" aria-label={PROFILE_COPY.postsAriaLabel.replace('{name}', name)}>
        <h2
          data-visual="profile-posts"
          className="mb-6 text-lg font-bold tracking-tight text-foreground"
        >
          {PROFILE_COPY.postsHeading}
        </h2>

        {posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            variant="card"
            title={PROFILE_COPY.emptyTitle}
            description={PROFILE_COPY.emptyBody.replace('{name}', name)}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} showPinned />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
