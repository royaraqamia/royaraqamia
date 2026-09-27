import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Calendar } from '@/frontend/ui/primitives/calendar';

afterEach(cleanup);

/* `data-day` is a locale-independent `yyyy-MM-dd` hook rendered by
   react-day-picker, so tests never depend on the Arabic day labels. */
function dayCell(container: HTMLElement, iso: string): HTMLElement {
  const cell = container.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  if (!cell) throw new Error(`No day cell for ${iso}`);
  return cell;
}

function dayButton(container: HTMLElement, iso: string): HTMLButtonElement {
  const button = dayCell(container, iso).querySelector('button');
  if (!button) throw new Error(`No day button for ${iso}`);
  return button;
}

const MARCH_2024 = new Date(2024, 2, 1);

describe('Calendar', () => {
  it('renders right-to-left in Arabic', () => {
    const { container } = render(<Calendar mode="single" month={MARCH_2024} />);
    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
  });

  it('points the nav chevrons outward for RTL', () => {
    const { container } = render(<Calendar mode="single" month={MARCH_2024} />);
    const buttons = container.querySelectorAll('nav button');
    expect(buttons).toHaveLength(2);

    /* DOM order is [previous, next]; `justify-between` puts previous at the RTL
       start (right edge). react-day-picker's Nav hardcodes the chevron
       orientation without consulting `dir`, so without our override previous
       would render a left chevron. Assert on the polygon point sets, which are
       the only locale-independent signal for orientation. */
    const rightChevron = '8 18.112'; // orientation="right"
    const leftChevron = '16 18.112'; // orientation="left"
    expect(buttons[0]?.querySelector('polygon')?.getAttribute('points')).toContain(rightChevron);
    expect(buttons[1]?.querySelector('polygon')?.getAttribute('points')).toContain(leftChevron);
  });

  it('selects a day through onSelect', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Calendar mode="single" month={MARCH_2024} selected={undefined} onSelect={onSelect} />
    );

    fireEvent.click(dayButton(container, '2024-03-15'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toEqual(new Date(2024, 2, 15));
  });

  it('marks the selected day with the primary fill', () => {
    const { container } = render(
      <Calendar mode="single" month={MARCH_2024} selected={new Date(2024, 2, 15)} />
    );

    expect(dayCell(container, '2024-03-15')).toHaveAttribute('data-selected');
    const className = dayButton(container, '2024-03-15').className;
    expect(className).toContain('bg-accent-purple');
    expect(className).toContain('text-accent-purple-foreground');
  });

  it('styles range start, middle and end distinctly', () => {
    const { container } = render(
      <Calendar
        mode="range"
        month={MARCH_2024}
        selected={{ from: new Date(2024, 2, 10), to: new Date(2024, 2, 20) }}
      />
    );

    expect(dayButton(container, '2024-03-10').className).toContain('rounded-s-lg');
    expect(dayButton(container, '2024-03-15').className).toContain('bg-primary/15');
    expect(dayButton(container, '2024-03-15').className).toContain('rounded-none');
    expect(dayButton(container, '2024-03-20').className).toContain('rounded-e-lg');
  });

  it('disables days before the min boundary', () => {
    const { container } = render(
      <Calendar mode="single" month={MARCH_2024} disabled={{ before: new Date(2024, 2, 10) }} />
    );

    expect(dayButton(container, '2024-03-05')).toBeDisabled();
    expect(dayButton(container, '2024-03-15')).not.toBeDisabled();
  });

  it('highlights today', () => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;

    const { container } = render(<Calendar mode="single" />);

    expect(dayCell(container, iso)).toHaveAttribute('data-today');
    expect(dayButton(container, iso).className).toContain('ring-primary/40');
  });

  it('lets a caller override the day button through the components prop', () => {
    render(
      <Calendar
        mode="single"
        month={MARCH_2024}
        components={{
          DayButton: ({ children }) => <button data-custom-day>{children}</button>,
        }}
      />
    );

    expect(document.querySelectorAll('[data-custom-day]').length).toBeGreaterThan(0);
  });
});
