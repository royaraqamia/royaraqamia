import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AssistantMark } from '@/frontend/ui/chats/assistant-mark';

describe('AssistantMark', () => {
  it('draws a member-style availability dot only when asked to', () => {
    const { container, rerender } = render(<AssistantMark online onlineLabel="متاحة الآن" />);

    expect(container.querySelector('.bg-emerald-500')).toBeInTheDocument();
    // Colour alone is not a state: the same words a member's dot carries.
    expect(screen.getByText('متاحة الآن')).toHaveClass('sr-only');

    rerender(<AssistantMark />);
    expect(container.querySelector('.bg-emerald-500')).toBeNull();
    expect(screen.queryByText('متاحة الآن')).toBeNull();
  });
});
