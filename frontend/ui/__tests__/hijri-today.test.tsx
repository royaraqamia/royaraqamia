import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { HijriToday } from '../shared/hijri-today';

describe('HijriToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the weekday with the Umm al-Qura date and ASCII digits', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 9, 0, 0));
    render(<HijriToday />);

    const line = screen.getByText(/الثلاثاء/);
    expect(line).toHaveTextContent(/^الثلاثاء \d{1,2} .+ 1\d{3} هـ$/);
  });

  it('rolls over to the next day after local midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 0));
    render(<HijriToday />);
    expect(screen.getByText(/الثلاثاء/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(screen.getByText(/الأربعاء/)).toBeInTheDocument();
  });
});
