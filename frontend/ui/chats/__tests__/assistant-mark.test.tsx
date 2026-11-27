import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AssistantMark } from '@/frontend/ui/chats/assistant-mark';

describe('AssistantMark', () => {
  it('draws the mark alone — the assistant carries no presence dot (ADR-0224)', () => {
    const { container } = render(<AssistantMark />);

    expect(container.querySelector('.bg-emerald-500')).toBeNull();
    expect(screen.queryByText('متاحة الآن')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
