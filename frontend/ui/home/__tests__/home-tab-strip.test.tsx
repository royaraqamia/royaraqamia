import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeTabStrip } from '../HomeTabStrip';

const state = vi.hoisted(() => ({ order: ['/quran', '/athkar', '/notes'] as string[] }));

vi.mock('@/frontend/state/home-services-provider', () => ({
  useHomeServices: () => ({
    order: state.order,
    status: 'ready',
    reload: async () => {},
    add: async () => null,
    remove: async () => null,
    reorder: async () => null,
  }),
}));

/** A pointer event jsdom can carry: it has no PointerEvent of its own. */
function pointer(
  target: Document | Element | Node | Window,
  type: string,
  init: { x: number; y?: number; pointerType?: string; pointerId?: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'touch',
    clientX: init.x,
    clientY: init.y ?? 10,
    button: 0,
  });
  fireEvent(target, event);
  return event;
}

/** The strip's arrange mode (ADR-0202): the toggle, the keyboard, the exit. */
describe('HomeTabStrip', () => {
  beforeEach(() => {
    state.order = ['/quran', '/athkar', '/notes'];
    // jsdom has no scrolling on elements; the drag only needs the call.
    HTMLElement.prototype.scrollBy = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the arrange control and toggles the mode', () => {
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={async () => null} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    expect(screen.getByRole('button', { name: 'تم' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves the focused tab with the arrow keys and saves the whole order', () => {
    const onReorder = vi.fn(async () => null);
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    const first = screen.getAllByRole('tab')[0];
    if (!first) throw new Error('the strip has no first tab');
    // The app is RTL, so ArrowLeft walks toward the end of the strip.
    fireEvent.keyDown(first, { key: 'ArrowLeft' });

    expect(onReorder).toHaveBeenCalledWith(['/athkar', '/quran', '/notes']);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'أذكار الصَّباح والمساء',
      'القرآن الكريم',
      'الملاحظات',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('الموضع 2 من 3');
  });

  it('leaves the mode when a tab is chosen, and selects it', () => {
    const onSelect = vi.fn();
    render(<HomeTabStrip selected="/quran" onSelect={onSelect} onReorder={async () => null} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));
    fireEvent.click(screen.getByRole('tab', { name: 'الملاحظات' }));

    expect(onSelect).toHaveBeenCalledWith('/notes');
    expect(screen.getByRole('button', { name: 'ترتيب' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('scrolls instead of lifting when the finger moves first', () => {
    const onReorder = vi.fn(async () => null);
    vi.useFakeTimers();
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    const pill = document.querySelector<HTMLElement>('[data-home-tab="/notes"]');
    if (!pill) throw new Error('the strip has no notes pill');

    // A swipe inside arrange mode: the gesture belongs to the scroller, so the
    // pill never lifts and the wait that would have lifted it is abandoned.
    pointer(pill, 'pointerdown', { x: 300 });
    pointer(window, 'pointermove', { x: 220 });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(pill.classList.contains('touch-none')).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('lifts the pill after a hold, then saves where it was dropped', () => {
    const onReorder = vi.fn(async () => null);
    vi.useFakeTimers();
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    const pill = document.querySelector<HTMLElement>('[data-home-tab="/athkar"]');
    if (!pill) throw new Error('the strip has no athkar pill');

    pointer(pill, 'pointerdown', { x: 300 });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // In hand: only the lifted pill owns the gesture from here on.
    expect(pill.classList.contains('touch-none')).toBe(true);

    pointer(window, 'pointermove', { x: 320 });
    pointer(window, 'pointerup', { x: 320 });

    // Every rect is zero in jsdom, so the pointer is over the first slot.
    expect(onReorder).toHaveBeenCalledWith(['/athkar', '/quran', '/notes']);
  });

  it('gives a mouse the drag on movement, with no hold to wait for', () => {
    const onReorder = vi.fn(async () => null);
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    const pill = document.querySelector<HTMLElement>('[data-home-tab="/athkar"]');
    if (!pill) throw new Error('the strip has no athkar pill');

    pointer(pill, 'pointerdown', { x: 300, pointerType: 'mouse' });
    pointer(window, 'pointermove', { x: 320, pointerType: 'mouse' });

    expect(pill.classList.contains('touch-none')).toBe(true);

    pointer(window, 'pointerup', { x: 320, pointerType: 'mouse' });

    expect(onReorder).toHaveBeenCalledWith(['/athkar', '/quran', '/notes']);
  });
});
