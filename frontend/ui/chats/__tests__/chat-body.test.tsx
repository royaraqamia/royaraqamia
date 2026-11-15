import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ resolveMentionHandles: vi.fn() }));

vi.mock('@/frontend/api/usernames', () => api);

import { ChatBody } from '@/frontend/ui/chats/chat-body';

/**
 * A bubble is the stored text drawn (ADR-0193): the marks the field wrote, the
 * line breaks it kept, and the links and handles every other surface has.
 */
describe('ChatBody', () => {
  it('draws each mark the field can write', () => {
    const { container } = render(<ChatBody text="**عريض** _مائل_ __مسطّر__ ~~مشطوب~~ `كود`" />);

    expect(container.querySelector('strong')).toHaveTextContent('عريض');
    expect(container.querySelector('em')).toHaveTextContent('مائل');
    expect(container.querySelector('u')).toHaveTextContent('مسطّر');
    expect(container.querySelector('s')).toHaveTextContent('مشطوب');
    expect(container.querySelector('code')).toHaveTextContent('كود');
    // The markers themselves are no longer text the reader sees.
    expect(container).not.toHaveTextContent('**');
  });

  it('keeps the line breaks the writer made', () => {
    const { container } = render(<ChatBody text={'سطر\nثانٍ'} />);

    expect(container.querySelector('br')).not.toBeNull();
    expect(container).toHaveTextContent('سطر');
    expect(container).toHaveTextContent('ثانٍ');
  });

  it('links a safe address and refuses a scheme that could execute', () => {
    render(<ChatBody text="[المقال](https://example.com/a) و [خطر](javascript:alert(1))" />);

    const link = screen.getByRole('link', { name: 'المقال' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    // The unsafe one stays the text it was stored as.
    expect(screen.queryByRole('link', { name: 'خطر' })).toBeNull();
  });

  it('still underlines a member who exists inside a formatted line', async () => {
    api.resolveMentionHandles.mockResolvedValue(['sara']);
    render(<ChatBody text="**مرحبا @sara**" />);

    const link = await screen.findByRole('link', { name: '@sara' });
    expect(link).toHaveAttribute('href', '/u/sara');
    expect(link.closest('strong')).not.toBeNull();
  });
});
