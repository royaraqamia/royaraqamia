import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { ChatComposer } from '@/frontend/ui/chats/chat-composer';

/** The field's ceiling, mirroring `FIELD_MAX_HEIGHT_PX` and Tailwind's `max-h-32`. */
const FIELD_MAX = 128;

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
    />
  );
}

/**
 * `scrollHeight` is the one input the fit reads and jsdom has no layout, so the
 * test hands the field a height instead of trusting one (ADR-0166).
 */
function fakeScrollHeight(field: HTMLElement) {
  let height = 0;
  Object.defineProperty(field, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
  return (next: number) => {
    height = next;
  };
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

describe('ChatComposer height', () => {
  it('grows one row per line, stops at the ceiling, and shrinks again', () => {
    const { rerender } = render(<Composer value="سطر" onSend={() => undefined} />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    const setHeight = fakeScrollHeight(field);

    // Two lines: the fit reads the content, not the draft's length in characters.
    setHeight(60);
    rerender(<Composer value={'سطر\nثانٍ'} onSend={() => undefined} />);
    expect(field.style.height).toBe('60px');
    expect(field.style.overflowY).toBe('hidden');

    // Past the ceiling the field keeps its height and scrolls the rest.
    setHeight(400);
    rerender(<Composer value={'a\nb\nc\nd\ne\nf\ng\nh'} onSend={() => undefined} />);
    expect(field.style.height).toBe(`${FIELD_MAX}px`);
    expect(field.style.overflowY).toBe('auto');

    // Deleting the lines gives the height back, and clearing the draft returns
    // the one-row field the composer starts as.
    setHeight(20);
    rerender(<Composer value="سطر" onSend={() => undefined} />);
    expect(field.style.height).toBe('20px');
    expect(field.style.overflowY).toBe('hidden');
  });
});
