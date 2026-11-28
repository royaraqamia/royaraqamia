import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/frontend/ui/chats/emoji-picker', () => ({
  EmojiPickerPanel: ({ onPick }: { labels: unknown; onPick: (glyph: string) => void }) => (
    <button type="button" onClick={() => onPick('😀')}>
      pick
    </button>
  ),
}));

import { PostCommentField } from '../post-comment-field';

describe('PostCommentField', () => {
  it('draws the chat row with an icon-only send button and no mic or attachment', async () => {
    render(<PostCommentField value="سلام" onChange={vi.fn()} onSend={vi.fn()} />);

    expect(await screen.findByRole('textbox', { name: 'اكتب تعليقاً…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إرسال التعليق' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تسجيل|مرفق/ })).not.toBeInTheDocument();
  });

  it('shows the remaining count only near the comment ceiling', async () => {
    const { rerender } = render(
      <PostCommentField value={'x'.repeat(100)} onChange={vi.fn()} onSend={vi.fn()} />
    );
    await screen.findByRole('textbox', { name: 'اكتب تعليقاً…' });
    expect(screen.queryByText(/متبقٍ/)).not.toBeInTheDocument();

    rerender(<PostCommentField value={'x'.repeat(1800)} onChange={vi.fn()} onSend={vi.fn()} />);
    expect(await screen.findByText('متبقٍ 200 حرف')).toBeInTheDocument();
  });

  it('docks the emoji tray under the row, with the switch back in the field', async () => {
    const onChange = vi.fn();
    render(<PostCommentField value="" onChange={onChange} onSend={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'إضافة إيموجي' }));
    expect(await screen.findByRole('button', { name: 'العودة إلى لوحة المفاتيح' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(await screen.findByRole('button', { name: 'pick' }));
    expect(onChange).toHaveBeenCalledWith('😀');
  });
});
