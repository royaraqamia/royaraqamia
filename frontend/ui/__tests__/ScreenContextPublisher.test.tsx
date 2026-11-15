import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { ScreenContextPublisher } from '@/frontend/ui/ScreenContextPublisher';
import { publishScreen, publishedScreen } from '@/frontend/state/screen-context';
import { useScreenScope } from '@/frontend/state/use-screen-scope';
import { SCREEN_CONTEXT_SETTLE_MS, type ScreenContext } from '@/shared/contracts/screen-context';

/** A sheet opened over the page, registering what the model should see. */
function FakeSheet({
  open,
  fields = [{ name: 'description', value: 'قهوة' }],
  text = '',
}: {
  open: boolean;
  fields?: Array<{ name: string; value: string; type?: string; autocomplete?: string }>;
  text?: string;
}) {
  useScreenScope(
    open
      ? {
          id: 'spendtrack.expense.edit',
          kind: 'dialog',
          focus: { kind: 'expense', id: '8f2c1a70-0000-4000-8000-000000000000' },
          fields,
          text,
        }
      : null
  );
  return null;
}

/** An admin dialog: the second way to stand on an operator surface (decision 8). */
function FakeAdminDialog({ open }: { open: boolean }) {
  useScreenScope(open ? { id: 'admin.member', kind: 'dialog' } : null);
  return null;
}

/** The snapshot as the composer would send it. */
function snapshot(): ScreenContext {
  return publishedScreen() as ScreenContext;
}

/**
 * The route provider (ADR-0181, decision 2 and 3).
 *
 * It publishes nothing until the page settles, and then publishes the page the
 * matrix names — or says it has no eyes, on a screen it may not show.
 */
describe('ScreenContextPublisher', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    navigation.search = '';
    document.title = 'الرئيسية | رؤيَة رقَميَّة';
    publishScreen(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => act(() => vi.advanceTimersByTime(SCREEN_CONTEXT_SETTLE_MS));

  it('waits for the page to settle before it publishes anything', () => {
    render(<ScreenContextPublisher />);

    expect(publishedScreen()).toBeNull();

    settle();

    expect(publishedScreen()).toMatchObject({ route: '/', screenId: 'home', product: 'home' });
  });

  it('publishes the screen the matrix gives the route, with the page’s own title', () => {
    navigation.pathname = '/notes';
    document.title = 'الملاحظات | رؤيَة رقَميَّة';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({
      route: '/notes',
      screenId: 'notes',
      product: 'notes',
      title: 'الملاحظات',
    });
  });

  it('publishes the tab the member is on, not just the path they share', () => {
    navigation.pathname = '/';
    navigation.search = '?tab=/quran';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({ screenId: 'quran', tab: '/quran' });
  });

  it('publishes a route it cannot name as route-only, never as an empty claim', () => {
    navigation.pathname = '/dashboard/reports';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({
      route: '/dashboard/reports',
      screenId: '',
      product: 'dashboard',
    });
  });

  it('has no eyes on the admin area: it sends the sentence, not the page', () => {
    navigation.pathname = '/admin/members';

    render(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toEqual({ blind: true });
  });

  it('does not let a registration reopen an admin route', () => {
    navigation.pathname = '/admin/members';

    render(
      <>
        <ScreenContextPublisher />
        <FakeSheet open />
      </>
    );
    settle();

    expect(publishedScreen()).toEqual({ blind: true });
  });

  it('closes the eyes on an admin dialog opened over a member screen', () => {
    navigation.pathname = '/spendtrack';

    render(
      <>
        <ScreenContextPublisher />
        <FakeSheet open />
        <FakeAdminDialog open />
      </>
    );
    settle();

    expect(publishedScreen()).toEqual({ blind: true });
  });

  it('opens them again when the admin dialog closes', () => {
    navigation.pathname = '/spendtrack';

    const { rerender } = render(
      <>
        <ScreenContextPublisher />
        <FakeAdminDialog open />
      </>
    );
    settle();
    expect(publishedScreen()).toEqual({ blind: true });

    rerender(
      <>
        <ScreenContextPublisher />
        <FakeAdminDialog open={false} />
      </>
    );
    settle();

    expect(publishedScreen()).toMatchObject({ screenId: 'spendtrack' });
  });

  it('replaces the snapshot when the member moves to another screen', () => {
    const { rerender } = render(<ScreenContextPublisher />);
    settle();
    expect(publishedScreen()).toMatchObject({ screenId: 'home' });

    navigation.pathname = '/notes';
    rerender(<ScreenContextPublisher />);
    settle();

    expect(publishedScreen()).toMatchObject({ screenId: 'notes' });
  });

  it('carries an open sheet and the focused record to the model', () => {
    navigation.pathname = '/spendtrack';

    render(
      <>
        <ScreenContextPublisher />
        <FakeSheet open />
      </>
    );
    settle();

    expect(snapshot()).toMatchObject({
      screenId: 'spendtrack',
      overlays: [{ id: 'spendtrack.expense.edit', kind: 'dialog' }],
      focus: { kind: 'expense', id: '8f2c1a70-0000-4000-8000-000000000000' },
      fields: { description: 'قهوة' },
    });
  });

  it('keeps what a closed sheet had out of the next snapshot', () => {
    navigation.pathname = '/spendtrack';

    const { rerender } = render(
      <>
        <ScreenContextPublisher />
        <FakeSheet open />
      </>
    );
    settle();
    expect(snapshot().overlays).toHaveLength(1);

    rerender(
      <>
        <ScreenContextPublisher />
        <FakeSheet open={false} />
      </>
    );
    settle();

    expect(snapshot()).toMatchObject({ overlays: [], focus: null });
  });

  it('never lets a password, an OTP or a card number into the turn', () => {
    navigation.pathname = '/spendtrack';

    render(
      <>
        <ScreenContextPublisher />
        <FakeSheet
          open
          fields={[
            { name: 'password', value: 'hunter2-secret', type: 'password' },
            { name: 'amount', value: '9999.99', type: 'password' },
            { name: 'code', value: '482913', autocomplete: 'one-time-code' },
            { name: 'description', value: '482913', autocomplete: 'one-time-code' },
            { name: 'card_number', value: '4111 1111 1111 1111', autocomplete: 'cc-number' },
            { name: 'currency', value: '4111 1111 1111 1111', autocomplete: 'cc-number' },
            { name: 'category_id', value: 'groceries' },
          ]}
        />
      </>
    );
    settle();

    expect(snapshot().fields).toEqual({ category_id: 'groceries' });
    expect(JSON.stringify(snapshot())).not.toContain('hunter2-secret');
    expect(JSON.stringify(snapshot())).not.toContain('482913');
    expect(JSON.stringify(snapshot())).not.toContain('4111');
  });

  it('publishes no fields and no text on a surface that opted out', () => {
    navigation.pathname = '/chats/new';

    render(
      <>
        <ScreenContextPublisher />
        <FakeSheet open text="رسالة لم تُرسل بعد" />
      </>
    );
    settle();

    expect(snapshot()).toMatchObject({ screenId: 'chats', fields: {}, text: '' });
  });
});
