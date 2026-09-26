import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getRecurringExpenses, createRecurringExpense } from '@/backend/controllers/spendtrack';

export async function GET() {
  return toNextResponse(await getRecurringExpenses());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createRecurringExpense(body);
  return toNextResponse(result);
}
