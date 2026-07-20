import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthUser } from '@/domains/spendtrack/lib/auth-guard';
import { CategoryList } from './category-list';
import { CreateCategoryDialog } from './create-category-dialog';

export default async function CategoriesPage() {
  const { user, supabase } = await getAuthUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack/categories');

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${user.id},is_default.eq.true`)
    .order('name');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight">التصنيفات</h1>
        <CreateCategoryDialog />
      </div>

      <Card className="animate-slide-up stagger-2">
        <CardHeader>
          <CardTitle>جميع التصنيفات</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryList categories={categories ?? []} userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
