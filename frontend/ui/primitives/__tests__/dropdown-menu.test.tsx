import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/* Radix popper measures its trigger with ResizeObserver; jsdom has none. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';

function renderMenu(onSelect: () => void) {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelect}>publish</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return screen.getByRole('button', { name: 'actions' });
}

describe('DropdownMenu', () => {
  it('does not select an item when the opening pointer is released over it', () => {
    // Radix opens on pointerdown and turns a pointerup that did not start on an
    // item into a synthetic click. If the panel appears under that pointer, the
    // release must not run a verb the user never chose.
    const onSelect = vi.fn();
    const trigger = renderMenu(onSelect);

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(screen.getByRole('menuitem', { name: 'publish' }), { button: 0 });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects an item on a later, separate click', () => {
    const onSelect = vi.fn();
    const trigger = renderMenu(onSelect);

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'publish' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
