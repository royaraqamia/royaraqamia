import { revalidatePath, revalidateTag } from 'next/cache';
import type { HttpResult } from '@/backend/transport/http-result';

export function revalidateResultPaths(result: HttpResult): void {
  if ('redirect' in result) return;
  for (const { path, type } of result.revalidate ?? []) {
    revalidatePath(path, type);
  }
  for (const tag of result.tags ?? []) {
    revalidateTag(tag, 'minutes');
  }
}
