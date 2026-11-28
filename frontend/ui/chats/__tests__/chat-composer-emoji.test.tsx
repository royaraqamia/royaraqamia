import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

/**
 * The panel is a chunk of its own; the tray's placement and dismissal have
 * their own file. What is tested here is the composer's half of the pair: the
 * row it draws, the tray under it, and the handle that writes into the field.
 */
vi.mock('@/frontend/ui/chats/emoji-picker', () => ({
  EmojiPickerPanel: ({ onPick }: { labels: unknown; onPick: (glyph: string) => void }) => (
    <button type="button" onClick={() => onPick('😀')}>
      pick
    </button>
  ),
}));

import { ChatComposer } from '@/frontend/ui/chats/chat-composer';

const FIELD_LABELS = {
  toolbar: 'تنسيق الرَّسالة',
  bold: 'عريض',
  italic: 'مائل',
  underline: 'تسطير',
  strike: 'يتوسطه خط',
  code: 'كود',
  link: 'رابط',
  linkPrompt: 'عنوان الرَّابط',
  emoji: {
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
  },
};

function element({
  onValueChange = vi.fn(),
  disabled = false,
}: { onValueChange?: (value: string) => void; disabled?: boolean } = {}) {
  return (
    <ChatComposer
      value=""
      onValueChange={onValueChange}
      onSend={vi.fn()}
      files={[]}
      onAddFiles={() => undefined}
      onRemoveFile={() => undefined}
      onRecorded={() => undefined}
      disabled={disabled}
      placeholder="اكتب رسالة"
      ariaLabel="نصّ الرسالة"
      sendLabel="إرسال"
      sendIcon={<span aria-hidden />}
      fieldLabels={FIELD_LABELS}
    />
  );
}

describe('ChatComposer emoji tray', () => {
  it('opens the tray under the row and writes the pick into the draft', async () => {
    const onValueChange = vi.fn();
    render(element({ onValueChange }));
    const trigger = await screen.findByRole('button', { name: 'إضافة إيموجي' });

    fireEvent.click(trigger);

    // The smiley is the switch back, and the row it sits in is still drawn.
    expect(await screen.findByRole('button', { name: 'العودة إلى لوحة المفاتيح' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(await screen.findByRole('textbox', { name: 'نصّ الرسالة' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'pick' }));
    expect(onValueChange).toHaveBeenCalledWith('😀');
  });

  it('closes the tray on Escape and hands the caret back to the field', async () => {
    render(element());
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة إيموجي' }));

    fireEvent.keyDown(await screen.findByRole('button', { name: 'pick' }), { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'pick' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'إضافة إيموجي' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('closes the tray when the composer can no longer take a glyph', async () => {
    const { rerender } = render(element());
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة إيموجي' }));
    await screen.findByRole('button', { name: 'pick' });

    // Sending disables the row; an open tray over a disabled composer is a panel
    // that writes nowhere.
    rerender(element({ disabled: true }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'pick' })).not.toBeInTheDocument()
    );
  });
});
