import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { loadCommunityMember, loadCommunityMembers } from '@/backend/loaders/community';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { PostCard } from '@/app/community/_components/post-card';
import { MemberChatCta } from '@/app/community/_components/member-chat-cta';

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
    return { title: 'الملف غير موجود' };
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

  return (
    <div className="mx-auto max-w-4xl">
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 shadow-sm sm:p-8">
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              @{member.username}
            </p>
            {member.bio?.trim() && (
              <p className="mx-auto mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {member.bio}
              </p>
            )}
            <MemberChatCta username={member.username} />
          </div>
        </div>
      </header>

      <section className="mt-10" aria-label={`منشورات ${name}`}>
        <h2 className="mb-6 text-lg font-bold tracking-tight text-foreground">المنشورات</h2>

        {posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            variant="card"
            title="لا توجد منشورات بعد"
            description={`لم ينشر ${name} أيَّ منشور على المجتمع حتَّى الآن.`}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
