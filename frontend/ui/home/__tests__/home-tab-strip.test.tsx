import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/** The strip's arrange mode (ADR-0202): the toggle, the keyboard, the exit. */
describe('HomeTabStrip', () => {
  beforeEach(() => {
    state.order = ['/quran', '/athkar', '/notes'];
  });

  it('offers the arrange control and hides the picker while arranging', () => {
    render(<HomeTabStrip selected="/quran" onSelect={() => {}} onReorder={async () => null} />);

    expect(screen.getByRole('button', { name: 'تطبيق جديد' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ترتيب' }));

    expect(screen.getByRole('button', { name: 'تم' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'تطبيق جديد' })).not.toBeInTheDocument();
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
});
