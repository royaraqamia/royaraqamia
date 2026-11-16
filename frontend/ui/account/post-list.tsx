'use client';

import { useRef } from 'react';
import { FileText, Plus, Search, X } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { TabChips } from '@/frontend/ui/primitives/tab-chips';
import { PostBulkBar } from './post-bulk-bar';
import { PostRow } from './post-row';
import { POST_FILTERS, usePostFilters, type PostFilter } from './use-post-filters';
import { usePostSelection } from './use-post-selection';
import type { Post } from '@/shared/contracts/blogpress';

interface PostListProps {
  posts: Post[];
  onEdit: (post: Post) => void;
  /** Repaints the store after a server-owned transition. */
  onChanged: () => Promise<void> | void;
  onCreate: () => void;
  initialFilter?: PostFilter;
}

/**
 * The posts page's list, as composition only: the toolbar picks the rows, the
 * bulk bar acts on them, the panel draws them, and each row owns its own verbs.
 *
 * What the list knows is in the hooks — `usePostFilters` for which rows, and
 * `usePostSelection` for which of them a bulk action would reach — so either
 * can be tested without mounting a Radix menu or an image loader.
 */
export function PostList({
  posts,
  onEdit,
  onChanged,
  onCreate,
  initialFilter = 'all',
}: PostListProps) {
  const { activeFilter, setActiveFilter, searchQuery, setSearchQuery, rows, counts, panelId } =
    usePostFilters(posts, initialFilter);
  const { selected, allSelected, toggle, toggleAll, clear } = usePostSelection(rows, {
    filter: activeFilter,
    query: searchQuery,
  });
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabChips
          label="تصفية المنشورات"
          items={POST_FILTERS.map((filter) => ({
            id: filter.value,
            label: filter.label,
            badge: filter.value === 'all' ? undefined : counts[filter.value],
          }))}
          activeId={activeFilter}
          onSelect={(id) => setActiveFilter(id as PostFilter)}
          idPrefix="account-posts"
          panelId={panelId}
          dataVisual="account-posts-chips"
        />

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            role="searchbox"
            inputMode="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث في منشوراتك"
            aria-label="ابحث في منشوراتك"
            data-visual="account-posts-search"
            className="h-10 w-full rounded-xl border border-border/70 bg-background ps-9 pe-3 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              aria-label="مسح البحث"
              className="absolute inset-e-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <PostBulkBar
          rows={rows}
          selected={selected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={clear}
          onChanged={onChanged}
        />
      ) : null}

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`account-posts-tab-${activeFilter}`}
        className="space-y-2.5"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            variant="card"
            title={searchQuery ? 'لا نتائج' : 'لا توجد منشورات بعد'}
            description={
              searchQuery
                ? 'لم نجد منشوراً يطابق بحثك.'
                : activeFilter === 'all'
                  ? 'ابدأ بكتابة أوَّل منشور لك.'
                  : 'لا توجد منشورات في هذه الحالة.'
            }
            action={
              !searchQuery && activeFilter === 'all' ? (
                <Button onClick={onCreate}>
                  <Plus className="ms-1.5 size-4" />
                  منشور جديد
                </Button>
              ) : undefined
            }
          />
        ) : (
          rows.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              isSelected={selected.has(post.id)}
              onToggleSelect={toggle}
              onEdit={onEdit}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}
