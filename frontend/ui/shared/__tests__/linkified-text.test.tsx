import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ resolveMentionHandles: vi.fn() }));

vi.mock('@/frontend/api/usernames', () => api);

import { LinkifiedText } from '@/frontend/ui/shared/linkified-text';

/**
 * The one renderer every plain-text surface uses (ADR-0192): what is pressable,
 * and what a handle becomes when nobody is behind it.
 */
describe('LinkifiedText', () => {
  it('renders a URL as an external link that cannot pass the referrer or the rank', () => {
    render(<LinkifiedText text="اقرأ https://example.com/x." />);

    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    // The sentence's full stop stays with the sentence.
    expect(document.body.textContent?.endsWith('.')).toBe(true);
  });

  it('keeps the writer’s line breaks: it renders inline, not as a block', () => {
    const { container } = render(
      <div className="whitespace-pre-wrap">
        <LinkifiedText text={'سطر\nثانٍ'} />
      </div>
    );

    // No wrapper element between the paragraph and the words.
    expect(container.firstElementChild?.childNodes[0]?.nodeName).toBe('#text');
  });

  it('links a handle only after a member answers for it', async () => {
    api.resolveMentionHandles.mockResolvedValue(['sara']);
    render(<LinkifiedText text="مرحبا @sara و @nobody" />);

    // The first paint is the writer's text, in both cases.
    expect(screen.queryByRole('link')).toBeNull();

    const link = await screen.findByRole('link', { name: '@sara' });
    expect(link).toHaveAttribute('href', '/u/sara');
    // A handle with nobody behind it is never a link to a 404.
    expect(screen.queryByRole('link', { name: '@nobody' })).toBeNull();
    expect(screen.getByText('@nobody')).toBeInTheDocument();
  });

  it('asks once for the handles it shows, not once per render', async () => {
    api.resolveMentionHandles.mockResolvedValue(['layla']);
    const { rerender } = render(<LinkifiedText text="@layla" />);
    await waitFor(() => expect(api.resolveMentionHandles).toHaveBeenCalledTimes(1));

    rerender(<LinkifiedText text="@layla" />);
    expect(api.resolveMentionHandles).toHaveBeenCalledTimes(1);
  });

  it('shows a token the excerpt cut in half as text, not as a link to half an address', () => {
    render(<LinkifiedText text="تفاصيل https://example.com/very/long…" truncated />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('https://example.com/very/long', { exact: false })).toBeInTheDocument();
  });

  it('still links a short excerpt that fits whole', () => {
    render(<LinkifiedText text="https://example.com/very/long" truncated />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/very/long');
  });
});
