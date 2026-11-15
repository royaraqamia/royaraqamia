import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  composeScreenContext,
  registerScreenScope,
  screenScopes,
  subscribeScreenScopes,
  type ScreenBase,
  type ScreenScope,
} from '@/frontend/state/screen-context';

const BASE: ScreenBase = {
  route: '/spendtrack',
  product: 'spendtrack',
  screenId: 'spendtrack',
  title: 'المصروفات',
  tab: null,
};

/**
 * The overlay registry and the snapshot it composes (ADR-0181, #1419).
 *
 * The route says where the member is; the stack says what is open above it and
 * what is in hand. These cases are about the second half, and about what
 * reaches the model when the surface would rather show more than the policy
 * allows.
 */
describe('composeScreenContext', () => {
  const page: ScreenScope = {
    id: 'spendtrack.page',
    kind: 'screen',
    fields: [
      { name: 'amount', value: '12.50' },
      { name: 'password', value: 'hunter2' },
    ],
  };

  const sheet: ScreenScope = {
    id: 'spendtrack.expense.edit',
    kind: 'dialog',
    focus: { kind: 'expense', id: '8f2c1a70-0000-4000-8000-000000000000' },
    fields: [{ name: 'description', value: 'قهوة' }],
  };

  it('publishes the route even when nothing registered', () => {
    expect(composeScreenContext(BASE, [])).toMatchObject({
      ...BASE,
      overlays: [],
      focus: null,
      fields: {},
      text: '',
    });
  });

  it('lets the topmost sheet carry its own id and the focused record', () => {
    const snapshot = composeScreenContext(BASE, [page, sheet]);

    expect(snapshot.overlays).toEqual([{ id: 'spendtrack.expense.edit', kind: 'dialog' }]);
    expect(snapshot.focus).toEqual({
      kind: 'expense',
      id: '8f2c1a70-0000-4000-8000-000000000000',
    });
    expect(snapshot.fields).toEqual({ description: 'قهوة' });
  });

  it('redacts the page’s fields even when it hands over a whole form', () => {
    const snapshot = composeScreenContext(BASE, [page]);

    expect(snapshot.fields).toEqual({ amount: '12.50' });
    expect(JSON.stringify(snapshot)).not.toContain('hunter2');
  });

  it('restores the page when the sheet closes', () => {
    composeScreenContext(BASE, [page, sheet]);
    const snapshot = composeScreenContext(BASE, [page]);

    expect(snapshot.overlays).toEqual([]);
    expect(snapshot.focus).toBeNull();
    expect(snapshot.fields).toEqual({ amount: '12.50' });
  });

  it('publishes no fields and no text on a surface that opted out', () => {
    const snapshot = composeScreenContext(
      { ...BASE, route: '/chats/1', product: 'chats', screenId: 'chats' },
      [
        {
          id: 'chats.thread',
          kind: 'screen',
          fields: [{ name: 'amount', value: '12.50' }],
          text: 'رسالة',
        },
      ]
    );

    expect(snapshot.fields).toEqual({});
    expect(snapshot.text).toBe('');
  });

  it('keeps the page’s focus when an overlay has none of its own', () => {
    const snapshot = composeScreenContext(BASE, [
      { ...page, focus: { kind: 'expense', id: 'row-1' } },
      { id: 'spendtrack.filters', kind: 'sheet' },
    ]);

    expect(snapshot.focus).toEqual({ kind: 'expense', id: 'row-1' });
  });

  it('lets a surface name the tab the route cannot', () => {
    expect(composeScreenContext({ ...BASE, tab: '/news' }, [])).toMatchObject({ tab: '/news' });
    expect(
      composeScreenContext({ ...BASE, tab: '/news' }, [{ ...page, tab: 'mine' }])
    ).toMatchObject({ tab: 'mine' });
  });

  it('lists the open overlays topmost last, and only the ones that fit', () => {
    const many: ScreenScope[] = Array.from({ length: 8 }, (_, index) => ({
      id: `sheet.${index}`,
      kind: 'sheet',
    }));

    const overlays = composeScreenContext(BASE, many).overlays;

    expect(overlays).toHaveLength(6);
    expect(overlays.at(-1)).toEqual({ id: 'sheet.7', kind: 'sheet' });
  });
});

describe('registerScreenScope', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function open(scope: ScreenScope): void {
    cleanups.push(registerScreenScope(scope));
  }

  it('publishes a scope until it is closed', () => {
    const close = registerScreenScope({ id: 'spendtrack.expense.create', kind: 'dialog' });
    expect(screenScopes().map((scope) => scope.id)).toEqual(['spendtrack.expense.create']);

    close();

    expect(screenScopes()).toEqual([]);
  });

  it('replaces a scope that re-registers under the same id rather than stacking it', () => {
    open({ id: 'spendtrack.expense.create', kind: 'dialog', text: 'first' });
    open({ id: 'spendtrack.expense.create', kind: 'dialog', text: 'second' });

    expect(screenScopes()).toEqual([
      { id: 'spendtrack.expense.create', kind: 'dialog', text: 'second' },
    ]);
  });

  it('tells the publisher every time the stack changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeScreenScopes(listener);

    const close = registerScreenScope({ id: 'spendtrack.filters', kind: 'sheet' });
    close();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
