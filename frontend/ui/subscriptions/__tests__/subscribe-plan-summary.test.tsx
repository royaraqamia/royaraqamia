import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SubscribePlanSummary } from '../subscribe-plan-summary';

afterEach(cleanup);

describe('SubscribePlanSummary', () => {
  it('prints the price as the loud figure and the term as quiet metadata', () => {
    render(<SubscribePlanSummary price="$10" durationDays={30} itemCap={50} />);

    expect(screen.getByText('$10')).toBeInTheDocument();

    const term = screen.getByText('لمدّة 30 يومًا');
    // The term is a separate line at body size, not the gradient the price carries.
    expect(term.className).toContain('text-muted-foreground');
    expect(term.className).not.toContain('bg-clip-text');
  });

  it('says what the plan holds, and nothing the page stopped selling', () => {
    render(<SubscribePlanSummary price="$10" durationDays={30} itemCap={50} />);

    expect(screen.getByText('حتَّى 50 عنصر من كل خدمة.')).toBeInTheDocument();
    expect(screen.queryByText(/خصم/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تطبيقات/)).not.toBeInTheDocument();
  });
});
