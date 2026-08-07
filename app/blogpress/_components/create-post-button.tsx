'use client';

import { useTransition } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { Plus, Loader2 } from 'lucide-react';
import { createPost } from '@/frontend/api/blogpress';

export function CreatePostButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const { id } = await createPost();
            window.location.assign(`/blogpress/editor/${id}`);
          } catch {
            // Navigation will not occur on failure
          }
        })
      }
      aria-busy={pending}
      aria-live="polite"
      aria-label={pending ? 'جاري إنشاء مقال جديد' : 'إنشاء مقال جديد'}
      className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-neutral-50 shadow-sm transition-all duration-200 ease-out hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-md hover:shadow-neutral-950/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950 select-none cursor-pointer"
    >
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-current" />
      ) : (
        <Plus className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:rotate-90 group-hover:scale-110" />
      )}
      <span className="truncate tracking-normal font-medium">
        {pending ? 'جاري الإنشاء...' : 'مقال جديد'}
      </span>
    </Button>
  );
}
