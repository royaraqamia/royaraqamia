import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';
import { loadCommunityMember } from '@/backend/loaders/community';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Button } from '@/frontend/ui/primitives/button';
import { PostCard } from '@/app/community/_components/post-card';

export const revalidate = 60;

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
      <nav aria-label="التَّنقُّل للخلف" className="mb-6 sm:mb-8">
        <Link href="/community">
          <Button
            variant="ghost"
            className="group rounded-full ps-3 pe-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            العودة إلى المجتمع
          </Button>
        </Link>
      </nav>

      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 shadow-sm sm:p-8">
        <span
          className="glow-orb pointer-events-none absolute -top-16 inset-e-[-10%] h-48 w-48 text-violet-500/20"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-start">
          <MemberAvatar
            name={member.name}
            avatarUrl={member.avatar_url}
            size="xl"
            sizes="80px"
            className="group"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-aref-ruqaa text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              @{member.username}
            </p>
            {member.bio?.trim() && (
              <p className="mx-auto mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground sm:mx-0">
                {member.bio}
              </p>
            )}
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
