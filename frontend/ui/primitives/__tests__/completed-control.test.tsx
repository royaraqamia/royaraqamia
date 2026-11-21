import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CompletedControl } from '../completed-control';

describe('CompletedControl', () => {
  it('stays focusable and announces the spent state', () => {
    render(<CompletedControl complete>Count</CompletedControl>);
    const button = screen.getByRole('button', { name: 'Count' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    button.focus();
    expect(button).toHaveFocus();
  });

  it('guards the handler when spent and acts when live', () => {
    const onClick = vi.fn();
    const { rerender } = render(<CompletedControl onClick={onClick}>Count</CompletedControl>);

    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <CompletedControl complete onClick={onClick}>
        Count
      </CompletedControl>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
