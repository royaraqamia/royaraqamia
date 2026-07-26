import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';
import { PostList } from './_components/post-list';
import { CreatePostButton } from './_components/create-post-button';
import { FileText, Eye, PenLine, BookOpen } from 'lucide-react';
import { estimateWordCount } from '@/lib/reading-time';
import type { Post } from '@/domains/blogpress/lib/definitions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  description: 'لوحة تحكُّم BlogPress – إدارة المقالات وإنشاء محتوى جديد.',
};

export default async function DashboardPage() {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', session.userId)
    .order('updated_at', { ascending: false });

  const postList = (posts as Post[]) ?? [];

  const stats = {
    total: postList.length,
    published: postList.filter((p) => p.status === 'published').length,
    drafts: postList.filter((p) => p.status === 'draft').length,
    totalWords: postList.reduce((sum, p) => sum + estimateWordCount(p.content), 0),
  };

  const statCards = [
    {
      label: 'إجمالي المقالات',
      value: stats.total,
      icon: FileText,
      bg: 'bg-primary/10',
      tx: 'text-primary',
    },
    { label: 'منشورة', value: stats.published, icon: Eye, bg: 'bg-success/10', tx: 'text-success' },
    {
      label: 'مسودَّة',
      value: stats.drafts,
      icon: PenLine,
      bg: 'bg-warning/10',
      tx: 'text-warning',
    },
    {
      label: 'إجمالي الكلمات',
      value: stats.totalWords.toLocaleString('ar'),
      icon: BookOpen,
      bg: 'bg-info/10',
      tx: 'text-info',
    },
  ] as const;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">إدارة المقالات</h1>
        </div>
        <CreatePostButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border/50 bg-card p-4 card-lift"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`size-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`size-5 ${stat.tx}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-none mb-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PostList posts={postList} />
    </div>
  );
}
