import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PresenceAvatar } from '@/frontend/ui/shared/presence-avatar';

const NOW = Date.now();

describe('PresenceAvatar', () => {
  it('draws a labelled dot only for a freshly stamped member', () => {
    const { rerender } = render(
      <PresenceAvatar
        name="أحمد"
        avatarUrl={null}
        lastSeenAt={new Date(NOW - 5_000).toISOString()}
      />
    );

    expect(screen.getByText('متصل الآن')).toBeInTheDocument();
    expect(document.querySelector('.bg-emerald-500')).not.toBeNull();

    rerender(<PresenceAvatar name="أحمد" avatarUrl={null} lastSeenAt={null} />);
    expect(screen.queryByText('متصل الآن')).not.toBeInTheDocument();
    expect(document.querySelector('.bg-emerald-500')).toBeNull();
  });
});
