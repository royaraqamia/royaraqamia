import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

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
      <ChatField value="**عريض**" onChange={vi.fn()} ariaLabel="نص الرسالة" labels={LABELS} />
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
      <ChatField value="سلام" onChange={vi.fn()} ariaLabel="نص الرسالة" labels={LABELS} disabled />
    );

    const field = await screen.findByRole('textbox', { name: 'نص الرسالة' });
    expect(field).toHaveAttribute('contenteditable', 'false');
  });
});
