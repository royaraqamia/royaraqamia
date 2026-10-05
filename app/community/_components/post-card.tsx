import Link from 'next/link';
import Image from 'next/image';
import { Calendar, User } from 'lucide-react';
import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { stripMarkdown } from '@/shared/reading-time';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { SocialShare } from './social-share';

interface PostCardProps {
  post: PostSummary;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  const body = post.content?.trim() ? stripMarkdown(post.content) : (post.meta_desc ?? '');

  return (
    <article className="group/community relative flex flex-col justify-between rounded-3xl border border-border bg-muted/20 overflow-hidden transition-safe duration-500 ease-out hover:border-border hover:bg-muted/40 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-background/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50">
      {post.cover_image && (
        <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/80">
          <Link
            href={`/community/${post.slug}`}
            className="block h-full w-full focus:outline-none"
            tabIndex={-1}
          >
            <Image
              src={post.cover_image}
              alt={post.title}
              fill
              priority={index < 2}
              sizes="(max-width: 768px) 100vw, 576px"
              className="object-cover transition-transform duration-700 ease-out group-hover/community:scale-105"
            />

            <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent opacity-60 group-hover/community:opacity-40 transition-opacity duration-500" />
          </Link>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between p-6 sm:p-7 relative">
        <div>
          {post.author?.name && (
            <div className="mb-3 flex items-center gap-2.5">
              {post.author.avatar_url?.trim() ? (
                <Image
                  src={post.author.avatar_url}
                  alt={post.author.name}
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover ring-2 ring-primary/20 shrink-0"
                />
              ) : (
                <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <User className="size-3.5" />
                </div>
              )}
              <span className="text-xs font-bold text-foreground">{post.author.name}</span>
            </div>
          )}

          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover/community:text-foreground transition-colors duration-300 leading-snug line-clamp-2">
            <Link
              href={`/community/${post.slug}`}
              className="focus:outline-none before:absolute before:inset-0"
            >
              {post.title}
            </Link>
          </h2>

          {body && (
            <CollapsibleText
              lines={4}
              className="mt-3 text-sm text-muted-foreground leading-relaxed font-normal"
              buttonClassName="relative z-20 text-primary hover:text-primary/90"
            >
              {body}
            </CollapsibleText>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-border flex items-center justify-between text-xs relative z-20">
          {post.published_at ? (
            <time
              dateTime={post.published_at}
              className="text-muted-foreground font-medium flex items-center gap-1.5"
            >
              <Calendar className="size-3.5 text-muted-foreground" />
              {new Intl.DateTimeFormat('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                calendar: 'islamic-umalqura',
                numberingSystem: 'latn',
              }).format(new Date(post.published_at))}
            </time>
          ) : (
            <span />
          )}

          <SocialShare url={`/community/${post.slug}`} title={post.title} />
        </div>
      </div>
    </article>
  );
}
