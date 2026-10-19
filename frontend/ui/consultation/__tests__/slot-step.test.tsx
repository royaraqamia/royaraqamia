import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailabilitySlot } from '@/shared/contracts/consultation';
import { SlotStep } from '@/frontend/ui/consultation/steps/slot-step';

const SLOT = {
  id: 's-1',
  starts_at: '2026-11-01T09:00:00.000Z',
  ends_at: '2026-11-01T10:00:00.000Z',
  is_booked: false,
} as unknown as AvailabilitySlot;

const MESSAGE = 'تعذَّر تحميل المواعيد المُتاحة. تحقَّق من اتِّصالك ثم أعِد المحاولة.';

function renderStep(props: Partial<React.ComponentProps<typeof SlotStep>> = {}) {
  return render(
    <SlotStep
      slots={[]}
      loading={false}
      selectedIds={[]}
      requiredCount={1}
      onToggle={() => {}}
      {...props}
    />
  );
}

describe('SlotStep', () => {
  /**
   * The whole reason this step takes an error prop: an empty calendar and an
   * unreachable server look the same to a component that only knows `length`,
   * and only one of them may be reported as "no appointments are open"
   * (ADR-0031).
   */
  it('names the connection instead of claiming no appointments are open', () => {
    renderStep({ error: MESSAGE, onRetry: () => {} });

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('لا توجد مواعيد مُتاحة حاليًّا')).not.toBeInTheDocument();
  });

  it('retries through the button it offers', () => {
    const onRetry = vi.fn();
    renderStep({ error: MESSAGE, onRetry });

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps a loaded list usable and says it may be out of date', () => {
    renderStep({ slots: [SLOT], error: MESSAGE, onRetry: () => {} });

    expect(screen.getByText(/قد لا تعكس القائمة/)).toBeInTheDocument();
    // The slot is still selectable — the submit path has its own conflict check.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('لا توجد مواعيد مُتاحة حاليًّا')).not.toBeInTheDocument();
  });

  it('still reports a genuinely empty calendar when the read succeeded', () => {
    renderStep();

    expect(screen.getByText('لا توجد مواعيد مُتاحة حاليًّا')).toBeInTheDocument();
  });
});
