'use client';

import { useTransition } from 'react';
import { Button } from '@/frontend/ui/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { createPost } from '@/backend/actions/blogpress/posts';

export function CreatePostButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => createPost())}
      className="transition-smooth shadow-sm hover:shadow-md"
      aria-busy={pending}
      aria-live="polite"
    >
      {pending ? (
        <Loader2 className="ms-2 size-4 animate-spin" />
      ) : (
        <Plus className="ms-2 size-4" />
      )}
      {pending ? 'جارٍ الإنشاء...' : 'مقال جديد'}
    </Button>
  );
}
