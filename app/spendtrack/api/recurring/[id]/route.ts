import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { updateRecurringExpense, deleteRecurringExpense } from '@/backend/controllers/spendtrack';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const result = await updateRecurringExpense(id, body);
  return toNextResponse(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await deleteRecurringExpense(id, body);
  return toNextResponse(result);
}
