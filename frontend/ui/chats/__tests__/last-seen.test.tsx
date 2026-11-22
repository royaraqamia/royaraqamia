import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LastSeenLine, lastSeenLabel } from '@/frontend/ui/chats/last-seen';
import { LAST_SEEN_LABELS } from '@/frontend/ui/chats/last-seen-labels';

const NOW = new Date('2026-11-22T12:00:00.000Z').getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function label(seen: string | null, now: number = NOW): string | null {
  return lastSeenLabel(LAST_SEEN_LABELS, seen, now);
}

describe('lastSeenLabel', () => {
  it('says nothing when the member has never been stamped', () => {
    expect(label(null)).toBeNull();
    expect(label('not-a-date')).toBeNull();
  });

  it('says online inside the 60-second window, including a clock just ahead', () => {
    expect(label(ago(59_000))).toBe(LAST_SEEN_LABELS.onlineNow);
    expect(label(new Date(NOW + 1_000).toISOString())).toBe(LAST_SEEN_LABELS.onlineNow);
  });

  it('uses the exact-time sentence once the window has passed', () => {
    expect(label(ago(61_000))).toContain('آخر ظهور اليوم الساعة');
  });

  it('distinguishes yesterday from an older date', () => {
    expect(label(ago(24 * 60 * 60_000 + 60_000))).toContain('آخر ظهور أمس الساعة');
    expect(label(ago(4 * 24 * 60 * 60_000))).toContain('آخر ظهور');
  });

  it('keeps digits ASCII in every sentence (ADR 0212)', () => {
    for (const text of [
      label(ago(61_000)),
      label(ago(24 * 60 * 60_000 + 60_000)),
      label(ago(4 * 24 * 60 * 60_000)),
    ]) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
    }
  });
});

describe('LastSeenLine', () => {
  it('is always available for the assistant', () => {
    render(<LastSeenLine labels={LAST_SEEN_LABELS} alwaysOnline />);
    expect(screen.getByText('متاحة الآن')).toBeInTheDocument();
  });

  it('renders nothing until a human has a stamp', () => {
    const { container } = render(<LastSeenLine labels={LAST_SEEN_LABELS} lastSeenAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
