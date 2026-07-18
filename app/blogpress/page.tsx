import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';
import { PostList } from './_components/post-list';
import { CreatePostButton } from './_components/create-post-button';
import type { Post } from '@/domains/blogpress/lib/definitions';

export default async function DashboardPage() {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', session.userId)
    .order('updated_at', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">المقالات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة ونشر مقالات المدونة</p>
        </div>
        <CreatePostButton />
      </div>
      <PostList posts={(posts as Post[]) ?? []} />
    </div>
  );
}
