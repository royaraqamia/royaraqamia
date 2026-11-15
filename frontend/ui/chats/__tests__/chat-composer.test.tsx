import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

/**
 * The rich field is the editor (ADR-0193); the row's own contract is what this
 * file tests, so the field arrives as a plain input with the same props. What
 * the editor does with a keystroke lives in `chat-field.test.tsx` and in the
 * browser.
 */
vi.mock('@/frontend/ui/chats/chat-field', () => ({
  CHAT_FIELD_MAX: 4000,
  ChatField: ({
    value,
    onChange,
    ariaLabel,
    onTyping,
    onDraftEmpty,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    onTyping?: () => void;
    onDraftEmpty?: () => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next);
        // The row's contract: a draft with no typing channel says nothing.
        if (!onTyping) return;
        if (next.trim()) onTyping();
        else onDraftEmpty?.();
      }}
    />
  ),
}));

import { ChatComposer } from '@/frontend/ui/chats/chat-composer';

function Composer({
  value,
  onSend,
  onTyping,
  onDraftEmpty,
  onValueChange = () => undefined,
}: {
  value: string;
  onSend: () => void;
  onTyping?: () => void;
  onDraftEmpty?: () => void;
  onValueChange?: (value: string) => void;
}) {
  return (
    <ChatComposer
      value={value}
      onValueChange={onValueChange}
      onTyping={onTyping}
      onDraftEmpty={onDraftEmpty}
      onSend={onSend}
      files={[]}
      onAddFiles={() => undefined}
      onRemoveFile={() => undefined}
      onRecorded={() => undefined}
      disabled={false}
      placeholder="اكتب رسالة"
      ariaLabel="نصّ الرسالة"
      sendLabel="إرسال"
      sendIcon={<span aria-hidden />}
      fieldLabels={{
        toolbar: 'تنسيق الرَّسالة',
        bold: 'عريض',
        italic: 'مائل',
        underline: 'تسطير',
        strike: 'يتوسطه خط',
        code: 'كود',
        link: 'رابط',
        linkPrompt: 'عنوان الرَّابط',
      }}
    />
  );
}

describe('ChatComposer keyboard', () => {
  it('leaves Enter to the field, which adds a line rather than sending', () => {
    const onSend = vi.fn();
    render(<Composer value="سلام" onSend={onSend} />);
    const field = screen.getByRole('textbox');

    // A prevented keydown is what would swallow the newline; nothing may.
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends from the button, which stays the only send path', () => {
    const onSend = vi.fn();
    render(<Composer value="سلام" onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe('ChatComposer typing signal', () => {
  it('tells the peer a keystroke happened', () => {
    const onTyping = vi.fn();
    const onDraftEmpty = vi.fn();
    render(<Composer value="" onSend={vi.fn()} onTyping={onTyping} onDraftEmpty={onDraftEmpty} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'س' } });
    expect(onTyping).toHaveBeenCalledTimes(1);
    expect(onDraftEmpty).not.toHaveBeenCalled();
  });

  it('ends the line at once when the draft is cleared, not on the window', () => {
    const onTyping = vi.fn();
    const onDraftEmpty = vi.fn();
    render(
      <Composer value="سلام" onSend={vi.fn()} onTyping={onTyping} onDraftEmpty={onDraftEmpty} />
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onDraftEmpty).toHaveBeenCalledTimes(1);
    expect(onTyping).not.toHaveBeenCalled();
  });

  it('says nothing when no typing channel is wired', () => {
    const onDraftEmpty = vi.fn();
    render(<Composer value="سلام" onSend={vi.fn()} onDraftEmpty={onDraftEmpty} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onDraftEmpty).not.toHaveBeenCalled();
  });
});
