import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetOverlayBackForTests, useOverlayBack, whenGuardDropped } from '../overlay-back';

/**
 * The Android shell answers the back press by walking the WebView's history, so
 * an open dialogue is only reachable by the press if it put an entry there. These
 * cases pin that contract: the entry exists while something is open, the press
 * closes one overlay and nothing else, and the entry is gone afterwards so the
 * next press walks the page as it always did.
 */

function guard(): unknown {
  return (window.history.state as Record<string, unknown> | null)?.__overlayGuard;
}

/** A real traversal, the way a back press arrives: state moves, then popstate. */
async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() => expect(window.location.pathname).toBe('/'));
}

function openLayer({ controlled = false }: { controlled?: boolean } = {}) {
  const onOpenChange = vi.fn();
  const hook = renderHook(() =>
    useOverlayBack(controlled ? { open: true, onOpenChange } : { defaultOpen: true, onOpenChange })
  );
  return { ...hook, onOpenChange };
}

describe('useOverlayBack', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    resetOverlayBackForTests();
  });

  it('puts one entry on the history while an overlay is open', () => {
    const { unmount } = openLayer();

    expect(guard()).toBe(1);
    expect(window.location.pathname).toBe('/');

    unmount();
  });

  it('closes the overlay on a back press and stays on the page', async () => {
    const { result, onOpenChange } = openLayer();

    expect(result.current[0]).toBe(true);
    await pressBack();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current[0]).toBe(false);
    expect(window.location.pathname).toBe('/');
    expect(guard()).toBeUndefined();
  });

  it('closes the overlay opened last, one press at a time', async () => {
    const outer = vi.fn();
    const inner = vi.fn();

    renderHook(() => {
      useOverlayBack({ defaultOpen: true, onOpenChange: outer });
      useOverlayBack({ defaultOpen: true, onOpenChange: inner });
      return null;
    });

    // One entry for the stack, not one per overlay: the entry is a landing place
    // for the press, and `depth` says how many overlays are behind it.
    expect(guard()).toBe(2);

    await pressBack();
    expect(inner).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();

    await pressBack();
    expect(outer).toHaveBeenCalledWith(false);
  });

  it('leaves the entry in place when the close is deferred', async () => {
    // A controlled dialogue that asks before discarding keeps itself open, which
    // is the same path the close button takes. The press must not be spent: the
    // next one has to reach the overlay again, not the page behind it.
    const onOpenChange = vi.fn();
    renderHook(() => useOverlayBack({ open: true, onOpenChange }));

    await pressBack();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await waitFor(() => expect(guard()).toBe(1));

    onOpenChange.mockClear();
    await pressBack();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('gives the entry back when the overlay closes on its own', async () => {
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => useOverlayBack({ open, onOpenChange: () => undefined }),
      { initialProps: { open: true } }
    );

    expect(guard()).toBe(1);

    rerender({ open: false });
    await waitFor(() => expect(guard()).toBeUndefined());

    unmount();
    expect(window.location.pathname).toBe('/');
  });

  it('does not spend the press on a forward move back onto the entry', async () => {
    const { onOpenChange } = openLayer();

    await pressBack();
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });
});

describe('whenGuardDropped', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    resetOverlayBackForTests();
  });

  it('resolves at once when no overlay entry is on the history', async () => {
    await expect(whenGuardDropped()).resolves.toBeUndefined();
  });

  /**
   * The bug this exists for: a link that closes its overlay and navigates in the
   * same click lost the navigation, because the close's traversal landed on the
   * router's uncommitted push. The navigation waits for the entry to go instead.
   */
  it('holds a navigation until the entry the close left behind is gone', async () => {
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useOverlayBack({ open, onOpenChange: () => undefined }),
      { initialProps: { open: true } }
    );

    expect(guard()).toBe(1);

    const navigated = vi.fn();
    void whenGuardDropped().then(navigated);

    rerender({ open: false });
    await waitFor(() => expect(guard()).toBeUndefined());
    await waitFor(() => expect(navigated).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/');
  });
});
