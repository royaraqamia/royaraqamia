import Link from 'next/link';
import Image from 'next/image';
import { Calendar, ArrowLeft } from 'lucide-react';
import type { PostSummary } from '@/shared/contracts/blogpress';

interface PostCardProps {
  post: PostSummary;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  return (
    <article className="group/blog relative flex flex-col justify-between rounded-3xl border border-border bg-muted/20 overflow-hidden transition-safe duration-500 ease-out hover:border-border hover:bg-muted/40 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-background/60 focus-within:ring-2 focus-within:ring-primary/50">
      {post.cover_image && (
        <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/80">
          <Link
            href={`/blog/${post.slug}`}
            className="block h-full w-full focus:outline-none"
            tabIndex={-1}
          >
            <Image
              src={post.cover_image}
              alt={post.title}
              fill
              priority={index < 2}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-700 ease-out group-hover/blog:scale-105"
            />

            <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent opacity-60 group-hover/blog:opacity-40 transition-opacity duration-500" />
          </Link>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between p-6 sm:p-7 relative">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover/blog:text-foreground transition-colors duration-300 leading-snug line-clamp-2">
            <Link
              href={`/blog/${post.slug}`}
              className="focus:outline-none before:absolute before:inset-0"
            >
              {post.title}
            </Link>
          </h2>

          {post.meta_desc && (
            <p className="mt-3 text-sm text-muted-foreground line-clamp-2 leading-relaxed font-normal">
              {post.meta_desc}
            </p>
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

          <span className="inline-flex items-center gap-1.5 text-primary text-xs font-bold group-hover/blog:text-primary/90 transition-colors">
            اقرأ المزيد
            <ArrowLeft
              className="size-3.5 transition-transform duration-300 group-hover/blog:-translate-x-1.5 rtl:group-hover/blog:translate-x-1.5"
              strokeWidth={2.5}
            />
          </span>
        </div>
      </div>
    </article>
  );
}
