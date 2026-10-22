'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { useActivatePlan } from '@/frontend/state/plans/use-admin-plans';
import type { AdminUserUsage, PlanActivationMethod } from '@/shared/contracts/plans';

const METHOD_LABELS: Record<PlanActivationMethod, string> = {
  shamcash: 'ShamCash',
  efendim: 'Efendim Pay',
  other: 'أخرى',
};

interface PlanActivationFormProps {
  user: AdminUserUsage;
  priceCents: number;
  currency: string;
  onCancel: () => void;
  onActivated: () => void;
}

/**
 * The operator's manual grant: amount, method and a note, then one deliberate
 * 30-day activation. The amount is a record of money that arrived elsewhere
 * (ADR-0006), which is why it is typed rather than charged.
 */
export function PlanActivationForm({
  user,
  priceCents,
  currency,
  onCancel,
  onActivated,
}: PlanActivationFormProps) {
  const [amount, setAmount] = useState((priceCents / 100).toFixed(2));
  const [method, setMethod] = useState<PlanActivationMethod>('shamcash');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { busy, error, activate } = useActivatePlan();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setLocalError('أدخل مبلغاً صالحاً.');
      return;
    }

    setLocalError(null);
    try {
      await activate({
        userId: user.userId,
        amountCents: Math.round(dollars * 100),
        method,
        note: note.trim() || undefined,
      });
      onActivated();
    } catch {
      // The hook already holds the server's message.
    }
  }

  return (
    <form className="space-y-3.5" onSubmit={handleSubmit}>
      <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-foreground">
        {user.name ?? user.email}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-amount" className="text-sm font-medium text-foreground">
          المبلغ المستلم ({currency})
        </label>
        <Input
          id="plan-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          value={amount}
          disabled={busy}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-method" className="text-sm font-medium text-foreground">
          طريقة الدفع
        </label>
        <Select
          value={method}
          onValueChange={(value) => setMethod(value as PlanActivationMethod)}
          disabled={busy}
        >
          <SelectTrigger id="plan-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METHOD_LABELS) as PlanActivationMethod[]).map((option) => (
              <SelectItem key={option} value={option}>
                {METHOD_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-note" className="text-sm font-medium text-foreground">
          ملاحظة (اختياري)
        </label>
        <Textarea
          id="plan-note"
          value={note}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {(localError ?? error) && (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      )}

      <DialogActions onCancel={onCancel}>
        <Button type="submit" isLoading={busy} className="w-full sm:w-auto">
          تفعيل 30 يوماً
        </Button>
      </DialogActions>
    </form>
  );
}
