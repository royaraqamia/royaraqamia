import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialShare } from '../social-share';

function mockNativeShare() {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  return share;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'share');
});

describe('SocialShare', () => {
  it('shares an absolute URL resolved from a site-relative path', async () => {
    const share = mockNativeShare();

    render(<SocialShare url="/community/test-post" title="منشور" />);
    fireEvent.click(screen.getByRole('button', { name: 'مشاركة المنشور' }));

    expect(share).toHaveBeenCalledWith({
      title: 'منشور',
      url: `${window.location.origin}/community/test-post`,
    });
  });
});
