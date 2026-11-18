import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
});
