export type Category = {
  id: string;
  user_id: string | null;
  name: string;
  colorHex: string;
  created_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'name' | 'colorHex'>;
};

export type ExpenseWithCategory = Expense & {
  categories?: Pick<Category, 'name' | 'colorHex'>;
};
