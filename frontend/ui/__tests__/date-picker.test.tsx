import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DatePicker, DateRangePicker } from '@/frontend/ui/primitives/date-picker';

/* Radix Popper measures the trigger with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(cleanup);

const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

function openTrigger(trigger: HTMLElement) {
  fireEvent.click(trigger);
}

function dayButton(iso: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-day="${iso}"] button`);
  if (!button) throw new Error(`No rendered day button for ${iso}`);
  return button;
}

const today = new Date();
const CURRENT_MONTH_FIRST = isoOf(today.getFullYear(), today.getMonth() + 1, 1);
const CURRENT_MONTH_FIFTEENTH = isoOf(today.getFullYear(), today.getMonth() + 1, 15);
const CURRENT_MONTH_TWENTIETH = isoOf(today.getFullYear(), today.getMonth() + 1, 20);

describe('DatePicker', () => {
  it('shows the placeholder when empty', () => {
    render(
      <DatePicker value="" onChange={() => {}} placeholder="اختر تاريخًا" aria-label="التاريخ" />
    );
    const trigger = screen.getByRole('button', { name: 'التاريخ' });
    expect(trigger).toHaveTextContent('اختر تاريخًا');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the formatted date when set', () => {
    render(<DatePicker value="2024-03-15" onChange={() => {}} aria-label="التاريخ" />);
    const trigger = screen.getByRole('button', { name: 'التاريخ' });
    expect(trigger).toHaveTextContent('2024');
    expect(trigger).not.toHaveTextContent('اختر تاريخًا');
  });

  it('does not open when disabled', () => {
    render(<DatePicker value="" onChange={() => {}} disabled aria-label="التاريخ" />);
    const trigger = screen.getByRole('button', { name: 'التاريخ' });
    expect(trigger).toBeDisabled();
    openTrigger(trigger);
    expect(document.querySelector('[data-day]')).toBeNull();
  });

  it('emits an ISO date when a day is selected', () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} aria-label="التاريخ" />);

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));
    fireEvent.click(dayButton(CURRENT_MONTH_FIRST));

    expect(onChange).toHaveBeenCalledWith(CURRENT_MONTH_FIRST);
  });

  it('disables days before min and allows later days', () => {
    render(
      <DatePicker value="" onChange={() => {}} min={CURRENT_MONTH_FIFTEENTH} aria-label="التاريخ" />
    );

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));

    expect(dayButton(isoOf(today.getFullYear(), today.getMonth() + 1, 5))).toBeDisabled();
    expect(dayButton(CURRENT_MONTH_TWENTIETH)).not.toBeDisabled();
  });

  it('clears the value from the footer', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2024-03-15" onChange={onChange} aria-label="التاريخ" />);

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));
    fireEvent.click(screen.getByRole('button', { name: 'مسح' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('hides the clear action when clearable is false', () => {
    render(
      <DatePicker value="2024-03-15" onChange={() => {}} clearable={false} aria-label="التاريخ" />
    );

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));
    expect(screen.queryByRole('button', { name: 'مسح' })).toBeNull();
  });

  it('opens on the month given by defaultMonth', () => {
    render(
      <DatePicker value="" onChange={() => {}} defaultMonth="2020-01-15" aria-label="التاريخ" />
    );

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));
    expect(document.querySelector('[data-day="2020-01-01"]')).not.toBeNull();
  });

  it('opens on the selected value month when defaultMonth is absent', () => {
    render(<DatePicker value="2021-07-04" onChange={() => {}} aria-label="التاريخ" />);

    openTrigger(screen.getByRole('button', { name: 'التاريخ' }));
    expect(document.querySelector('[data-day="2021-07-01"]')).not.toBeNull();
  });
});

describe('DateRangePicker', () => {
  it('formats a full range, a from-only range and a to-only range', () => {
    const { rerender } = render(
      <DateRangePicker from="2024-03-10" to="2024-03-20" onChange={() => {}} aria-label="الفترة" />
    );
    expect(screen.getByRole('button', { name: 'الفترة' })).toHaveTextContent('—');

    rerender(<DateRangePicker from="2024-03-10" to="" onChange={() => {}} aria-label="الفترة" />);
    expect(screen.getByRole('button', { name: 'الفترة' })).toHaveTextContent('2024');
    expect(screen.getByRole('button', { name: 'الفترة' })).not.toHaveTextContent('—');

    rerender(<DateRangePicker from="" to="2024-03-20" onChange={() => {}} aria-label="الفترة" />);
    expect(screen.getByRole('button', { name: 'الفترة' })).toHaveTextContent('حتى');
  });

  it('emits both ends when a range is cleared', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-03-10" to="2024-03-20" onChange={onChange} aria-label="الفترة" />
    );

    openTrigger(screen.getByRole('button', { name: 'الفترة' }));
    fireEvent.click(screen.getByRole('button', { name: 'مسح' }));

    expect(onChange).toHaveBeenCalledWith('', '');
  });
});
