import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/ui/card';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import { CategoryList } from './category-list';
import { CreateCategoryDialog } from './create-category-dialog';

export const metadata: Metadata = {
  title: 'تصنيفات المصروفات',
  description: 'إدارة وتنظيم تصنيفات المصروفات في SpendTrack.',
};

export default async function CategoriesPage() {
  const { user, supabase } = await getAuthUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack/categories');

  const categories = await createSpendtrackService(supabase).getUserCategories(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
        <h1 className="text-3xl font-display font-bold tracking-tight">التَّصنيفات</h1>
        <CreateCategoryDialog />
      </div>

      <Card className="animate-slide-up stagger-2 card-lift">
        <CardHeader>
          <CardTitle>جميع التَّصنيفات</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryList categories={categories} userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
