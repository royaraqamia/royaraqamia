import type { Metadata } from 'next';
import { FileText } from 'lucide-react';

import { requireAuth } from '@/backend/middleware/auth-guard';
import { loadAccountPosts } from '@/backend/loaders/community';
import { PostCard } from '@/app/community/_components/post-card';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'المنشورات',
  description: 'منشوراتك على مجتمع رؤيَة رَقَميَّة.',
};

export default async function AccountPostsPage() {
  const { user } = await requireAuth('/auth/login?redirect=/account/posts');
  const { posts } = await loadAccountPosts(user.id);

  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
        <SectionTitle as="h1">
          <SectionTitleHighlight>المنشورات</SectionTitleHighlight>
        </SectionTitle>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          variant="card"
          title="لا توجد منشورات بعد"
          description="لم تنشر أيَّ منشور على المجتمع حتَّى الآن."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
