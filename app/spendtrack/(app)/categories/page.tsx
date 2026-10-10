import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { loadDefaultCategories, loadUserCategories } from '@/backend/loaders/spendtrack';
import { SpendtrackProvider } from '@/frontend/state/spendtrack/spendtrack-context';
import { CategoryList } from './category-list';
import { CreateCategoryDialog } from './create-category-dialog';

export const metadata: Metadata = {
  title: 'تصنيفات المصروفات',
  description: 'إدارة وتنظيم تصنيفات المصروفات في SpendTrack.',
};

export default async function CategoriesPage() {
  const { user } = await getOptionalUser();

  const categories = user ? await loadUserCategories(user.id) : await loadDefaultCategories();
  const userId = user?.id ?? '';

  return (
    <SpendtrackProvider
      seed={{
        categories,
        expenses: [],
        budgets: [],
        recurring: [],
        user: user ? { id: user.id } : null,
      }}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-3xl font-display font-bold tracking-tight">التَّصنيفات</h1>
          <CreateCategoryDialog />
        </div>

        <Card className=" stagger-2 card-lift">
          <CardHeader>
            <CardTitle>جميع التَّصنيفات</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryList categories={categories} userId={userId} allowEditAll={!user} />
          </CardContent>
        </Card>
      </div>
    </SpendtrackProvider>
  );
}
