'use client';

import { useState } from 'react';
import { Calendar, Check, Copy, Trash } from 'lucide-react';

import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import { BULK_ACTION_BAR_COPY } from './bulk-action-bar-copy';

interface BulkActionBarProps {
  allSelected: boolean;
  total: number;
  selectedCount: number;
  onToggleAll: () => void;
  onClear: () => void;
  onCopyAll: () => void;
  onOpenExpiry: () => void;
  expiryOpen: boolean;
  expiryDate: string;
  onExpiryDateChange: (value: string) => void;
  onApplyExpiry: () => void;
  onDelete: () => void;
  busy: boolean;
}

/**
 * The owned-link dashboard's bulk bar (#942).
 *
 * It is its own component because the app draws it natively and the two are a
 * pair (ADR-0098): the page is the reference, the words come from
 * `shared/copy/account-links-bulk.json`, and `data-visual` names the boxes the
 * visual gate compares (`shared/visual/account-links.json`). The delete
 * confirmation lives here rather than in the dashboard so every string the bar
 * shows is rendered by the component the app is paired with.
 */
export function BulkActionBar({
  allSelected,
  total,
  selectedCount,
  onToggleAll,
  onClear,
  onCopyAll,
  onOpenExpiry,
  expiryOpen,
  expiryDate,
  onExpiryDateChange,
  onApplyExpiry,
  onDelete,
  busy,
}: BulkActionBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const count =
    selectedCount > 0
      ? BULK_ACTION_BAR_COPY.countSelected
          .replace('{selected}', String(selectedCount))
          .replace('{total}', String(total))
      : BULK_ACTION_BAR_COPY.countTotal.replace('{total}', String(total));

  return (
    <>
      <div
        data-visual="link-bulk-bar"
        className="sticky top-3 z-20 bg-card/90 border border-border rounded-xl p-3 shadow-sm flex items-center gap-3 flex-wrap"
      >
        <button
          type="button"
          data-visual="link-bulk-select-all"
          onClick={onToggleAll}
          aria-pressed={allSelected}
          className="inline-flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors cursor-pointer focus-ring touch-target p-1 rounded-md"
        >
          <span
            data-visual="link-bulk-checkbox"
            className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-colors ${
              allSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/40'
            }`}
          >
            <Check aria-hidden="true" className="w-3 h-3" strokeWidth={3} />
          </span>
          {BULK_ACTION_BAR_COPY.selectAll}
        </button>

        <span
          data-visual="link-bulk-count"
          aria-live="polite"
          className="text-xs text-muted-foreground"
        >
          {count}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          data-visual="link-bulk-clear"
          onClick={onClear}
          disabled={selectedCount === 0 || busy}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
        >
          {BULK_ACTION_BAR_COPY.clear}
        </button>

        <button
          type="button"
          data-visual="link-bulk-copy"
          onClick={onCopyAll}
          disabled={selectedCount === 0 || busy}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
        >
          <Copy aria-hidden="true" className="w-3.5 h-3.5" />
          {BULK_ACTION_BAR_COPY.copy}
        </button>

        <button
          type="button"
          data-visual="link-bulk-expiry"
          onClick={onOpenExpiry}
          disabled={selectedCount === 0 || busy}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
        >
          <Calendar aria-hidden="true" className="w-3.5 h-3.5" />
          {BULK_ACTION_BAR_COPY.expiry}
        </button>

        {expiryOpen ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <DatePicker
              value={expiryDate}
              onChange={onExpiryDateChange}
              aria-label={BULK_ACTION_BAR_COPY.expiryLabel}
              placeholder={BULK_ACTION_BAR_COPY.expiryPlaceholder}
              className="h-8 rounded-lg px-2.5 text-xs"
            />
            <button
              type="button"
              onClick={onApplyExpiry}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
            >
              {BULK_ACTION_BAR_COPY.apply}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          data-visual="link-bulk-delete"
          onClick={() => setConfirmOpen(true)}
          disabled={selectedCount === 0 || busy}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
        >
          <Trash aria-hidden="true" className="w-3.5 h-3.5" />
          {BULK_ACTION_BAR_COPY.delete}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={BULK_ACTION_BAR_COPY.deleteTitle}
        message={BULK_ACTION_BAR_COPY.deleteMessage.replace('{count}', String(selectedCount))}
        confirmLabel={BULK_ACTION_BAR_COPY.deleteConfirm}
        cancelLabel={BULK_ACTION_BAR_COPY.deleteCancel}
        icon={Trash}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
