import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { ChatField, type ChatFieldHandle } from '@/frontend/ui/chats/chat-field';

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
  it('reports the switch rather than drawing the tray itself', async () => {
    const onEmojiOpenChange = vi.fn();
    render(
      <ChatField
        value=""
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
        onEmojiOpenChange={onEmojiOpenChange}
      />
    );

    const trigger = await screen.findByRole('button', { name: 'إضافة إيموجي' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);

    expect(onEmojiOpenChange).toHaveBeenCalledWith(true);
  });

  it('turns into the keyboard switch while the tray is open', async () => {
    const onEmojiOpenChange = vi.fn();
    render(
      <ChatField
        value=""
        onChange={vi.fn()}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
        emojiOpen
        onEmojiOpenChange={onEmojiOpenChange}
      />
    );

    const trigger = await screen.findByRole('button', { name: 'العودة إلى لوحة المفاتيح' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);

    expect(onEmojiOpenChange).toHaveBeenCalledWith(false);
  });

  it('writes a glyph at the caret through the handle the composer holds', async () => {
    const onChange = vi.fn();
    const ref = createRef<ChatFieldHandle>();
    render(
      <ChatField
        ref={ref}
        value=""
        onChange={onChange}
        ariaLabel="نص الرسالة"
        labels={EMOJI_LABELS}
        maxLength={4000}
        onEmojiOpenChange={vi.fn()}
      />
    );
    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });

    act(() => ref.current?.insertEmoji('😀'));

    // The tray's press moved the focus, not the caret: the glyph lands where
    // the member left the cursor, and the row reports the new draft.
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
        onEmojiOpenChange={vi.fn()}
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
