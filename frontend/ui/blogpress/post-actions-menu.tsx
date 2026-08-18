'use client';

import { useState } from 'react';
import { CopyPlus, FileDown, FileCode2, Loader2, MoreHorizontal, Check } from 'lucide-react';
import { toast } from 'sonner';
import { duplicatePost } from '@/frontend/api/blogpress';
import { downloadPostAsFile } from '@/frontend/shared/blogpress/export-post';
import { Button } from '@/frontend/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';

interface PostActionsMenuProps {
  postId: string;
  title: string;
  getMarkdown: () => string;
  onDuplicated: (newId: string) => void;
}

export function PostActionsMenu({
  postId,
  title,
  getMarkdown,
  onDuplicated,
}: PostActionsMenuProps) {
  const [duplicating, setDuplicating] = useState(false);
  const [exported, setExported] = useState<'markdown' | 'html' | null>(null);

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const { id } = await duplicatePost(postId);
      toast.success('تم إنشاء نسخة من المقال');
      onDuplicated(id);
    } catch {
      toast.error('فشل نسخ المقال');
    } finally {
      setDuplicating(false);
    }
  };

  const handleExport = async (format: 'markdown' | 'html') => {
    try {
      await downloadPostAsFile(title, getMarkdown(), format);
      setExported(format);
      toast.success(
        format === 'markdown' ? 'تم تصدير المقال بصيغة Markdown' : 'تم تصدير المقال بصيغة HTML'
      );
      setTimeout(() => setExported(null), 2000);
    } catch {
      toast.error('فشل تصدير المقال');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="إجراءات المقال"
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem
          onClick={handleDuplicate}
          disabled={duplicating}
          className="cursor-pointer gap-2 text-xs font-medium"
        >
          {duplicating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CopyPlus className="size-4" />
          )}
          <span>{duplicating ? 'جارٍ النسخ...' : 'نسخ المقال'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 border-border/60" />
        <DropdownMenuItem
          onClick={() => handleExport('markdown')}
          className="cursor-pointer gap-2 text-xs font-medium"
        >
          {exported === 'markdown' ? (
            <Check className="size-4 text-success" />
          ) : (
            <FileDown className="size-4" />
          )}
          <span>تصدير Markdown</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('html')}
          className="cursor-pointer gap-2 text-xs font-medium"
        >
          {exported === 'html' ? (
            <Check className="size-4 text-success" />
          ) : (
            <FileCode2 className="size-4" />
          )}
          <span>تصدير HTML</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
