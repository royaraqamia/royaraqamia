import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

/**
 * The sheet is a chunk of its own; the field's contract is what it hands it.
 * A panel that immediately reports one glyph stands in for the catalog here —
 * the sheet's own search and tabs are tested in `emoji-picker.test.tsx`.
 */
vi.mock('@/frontend/ui/chats/emoji-picker', () => ({
  EmojiPickerPanel: ({ onPick }: { labels: unknown; onPick: (glyph: string) => void }) => (
    <button type="button" onClick={() => onPick('😀')}>
      pick
    </button>
  ),
}));

import { ChatField } from '@/frontend/ui/chats/chat-field';

/** The surface's words, as the thread passes them. */
const LABELS = {
  toolbar: 'تنسيق الرَّسالة',
  bold: 'عريض',
  italic: 'مائل',
  underline: 'تسطير',
  strike: 'يتوسطه خط',
  code: 'كود',
  link: 'رابط',
  linkPrompt: 'عنوان الرَّابط',
};

/** The same field on a composer, which is the only surface that words the sheet. */
const EMOJI_LABELS = {
  ...LABELS,
  emoji: {
    open: 'إضافة إيموجي',
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

/**
 * The message field is an editor (ADR-0193): one paragraph of inline marks,
 * Enter is a line break, and the stored text is what the bubble will render.
 * What it writes is tested in `shared/text/chat-markdown`; this is the surface —
 * its direction, its ceiling and the marks it opens on.
 */
async function open(value = '', onChange = vi.fn()) {
  render(
    <ChatField
      value={value}
      onChange={onChange}
      ariaLabel="نص الرسالة"
      placeholder="اكتب"
      labels={LABELS}
      maxLength={4000}
    />
  );
  return { field: await screen.findByRole('textbox', { name: 'نص الرسالة' }), onChange };
}

describe('ChatField', () => {
  it('takes its direction from the text and caps its height', async () => {
    const { field } = await open();

    expect(field).toHaveAttribute('dir', 'auto');
    expect(field).toHaveClass('tiptap');
    // The ceiling is the row's, not the textarea's: the field scrolls inside it.
    expect(field).toHaveClass('max-h-32');
  });

  it('carries the accessible name the thread words for it', async () => {
    const { field } = await open();

    expect(field).toHaveAttribute('role', 'textbox');
    expect(field).toHaveAttribute('aria-multiline', 'true');
  });

  it('opens on the marks the stored text holds', async () => {
    render(
      <ChatField
        value="**عريض**"
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={LABELS}
        maxLength={4000}
      />
    );

    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });
    expect(field.querySelector('strong')).toHaveTextContent('عريض');
  });

  it('wraps a token that reaches the edge instead of widening the row', async () => {
    const { field } = await open();

    // `wrap-anywhere` is what lets a token with no space in it break; with
    // `break-words` its min-content width still set the row's width, and the
    // field pushed the composer (and the panel) wider than its container.
    expect(field).toHaveClass('wrap-anywhere');
  });

  it('keeps the field read-only when it is disabled', async () => {
    render(
      <ChatField
        value="سلام"
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={LABELS}
        maxLength={4000}
        disabled
      />
    );

    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });
    expect(field).toHaveAttribute('contenteditable', 'false');
  });
});

describe('ChatField emoji', () => {
  it('opens the sheet from the field and writes the glyph into the draft', async () => {
    const onChange = vi.fn();
    render(
      <ChatField
        value=""
        onChange={onChange}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
      />
    );
    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });

    // The trigger opens the sheet; the first glyph writes at the caret.
    const trigger = screen.getByRole('button', { name: 'إضافة إيموجي' });
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole('button', { name: 'pick' }));

    expect(onChange).toHaveBeenCalledWith('😀');
    expect(field).toHaveTextContent('😀');
  });

  it('draws the smiley inside the field, where the text will not run under it', async () => {
    render(
      <ChatField
        value=""
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
      />
    );

    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });
    expect(field).toHaveClass('pr-10');
    expect(screen.getByRole('button', { name: 'إضافة إيموجي' })).toHaveClass('right-1');
  });

  it('draws no smiley in the bubble a line is edited in', async () => {
    render(
      <ChatField
        value="سلام"
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
        compact
      />
    );

    await screen.findByRole('textbox', { name: 'نص الرسالة' });
    expect(screen.queryByRole('button', { name: 'إضافة إيموجي' })).not.toBeInTheDocument();
  });
});
