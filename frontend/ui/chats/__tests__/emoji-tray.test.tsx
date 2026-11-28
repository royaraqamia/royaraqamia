import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The panel is a chunk of its own; what the tray owns is where it sits and how
 * it goes away. A panel that reports one glyph stands in for the catalog — the
 * grid and its search are tested in `emoji-picker.test.tsx`.
 */
vi.mock('@/frontend/ui/chats/emoji-picker', () => ({
  EmojiPickerPanel: ({ onPick }: { labels: unknown; onPick: (glyph: string) => void }) => (
    <button type="button" onClick={() => onPick('😀')}>
      pick
    </button>
  ),
}));

import { EmojiTray } from '@/frontend/ui/chats/emoji-tray';

const LABELS = {
  open: 'إضافة إيموجي',
  keyboard: 'العودة إلى لوحة المفاتيح',
  search: 'ابحث عن إيموجي',
  noResults: 'لا نتائج',
  recent: 'الأخيرة',
  categories: {
    smileys: 'الوجوه',
    gestures: 'الإيماءات',
    hearts: 'القلوب',
    animals: 'الحيوانات',
    food: 'الطعام',
    activity: 'الأنشطة',
    travel: 'السفر',
    objects: 'الأشياء',
    symbols: 'الرموز',
  },
};

function tray(open = true) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const view = render(<EmojiTray open={open} labels={LABELS} onPick={onPick} onClose={onClose} />);
  return { onPick, onClose, ...view };
}

/**
 * The tray is the composer's second row, not a floating surface: it is drawn in
 * the flow below the field (ADR-0225's 2026-11-28 amendment), so what is tested
 * here is that a panel's glyph reaches the field and that every way out of the
 * tray is a way a member would take.
 */
describe('EmojiTray', () => {
  it('draws nothing until the composer opens it', () => {
    tray(false);

    expect(screen.queryByRole('dialog', { name: LABELS.open })).not.toBeInTheDocument();
  });

  it('hands the panel its labels and the picked glyph', async () => {
    const { onPick } = tray();

    fireEvent.click(await screen.findByRole('button', { name: 'pick' }));

    expect(onPick).toHaveBeenCalledWith('😀');
  });

  it('closes on a press anywhere outside, without asking for the keyboard', () => {
    const { onClose } = tray();

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('leaves the press on the smiley to the switch that owns it', () => {
    const { onClose } = tray();

    // The switch reports its own state; closing here would close and reopen the
    // tray on the same tap.
    const toggle = document.createElement('button');
    toggle.setAttribute('data-emoji-toggle', '');
    document.body.append(toggle);
    fireEvent.pointerDown(toggle);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a press inside itself, so three hearts are three taps', async () => {
    const { onClose } = tray();

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'pick' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets Escape close it and put the caret back in the field', async () => {
    const { onClose } = tray();

    fireEvent.keyDown(await screen.findByRole('button', { name: 'pick' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledWith(true);
  });
});
