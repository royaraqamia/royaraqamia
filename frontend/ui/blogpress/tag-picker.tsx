'use client';

import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { PostTag } from '@/shared/contracts/blogpress';

export function slugifyTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

interface TagPickerProps {
  availableTags: PostTag[];
  selectedTags: PostTag[];
  onToggle: (tag: PostTag) => void;
  onCreate: (name: string, slug: string) => Promise<PostTag | null>;
  disabled?: boolean;
}

export function TagPicker({
  availableTags,
  selectedTags,
  onToggle,
  onCreate,
  disabled,
}: TagPickerProps) {
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const selectedIds = new Set(selectedTags.map((t) => t.id));

  const handleCreate = async () => {
    const trimmed = draft.trim();
    if (!trimmed || creating) return;
    const existing = availableTags.find(
      (t) => t.name === trimmed || t.slug === slugifyTag(trimmed)
    );
    if (existing) {
      setDraft('');
      if (!selectedIds.has(existing.id)) onToggle(existing);
      return;
    }
    setCreating(true);
    try {
      const created = await onCreate(trimmed, slugifyTag(trimmed));
      if (created) {
        setDraft('');
        onToggle(created);
      }
    } finally {
      setCreating(false);
    }
  };

  const suggestions = availableTags.filter(
    (t) => !selectedIds.has(t.id) && (draft ? slugifyTag(t.name).includes(slugifyTag(draft)) : true)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {selectedTags.length === 0 && (
          <p className="text-[11px] text-muted-foreground/60">لم تُضَف وسوم بعد</p>
        )}
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-xs font-medium"
          >
            <span>#{tag.name}</span>
            <button
              type="button"
              onClick={() => onToggle(tag)}
              disabled={disabled}
              className="inline-flex size-4 items-center justify-center rounded-full text-primary/70 hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
              aria-label={`إزالة الوسم ${tag.name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="اسم وسم جديد..."
          aria-label="إضافة وسم"
          className="h-9 flex-1 rounded-lg border border-border/60 bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary min-w-0"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={disabled || creating || draft.trim().length === 0}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="إضافة وسم"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag)}
              disabled={disabled}
              className="inline-flex items-center rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
