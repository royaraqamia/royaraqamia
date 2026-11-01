import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const session = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('@/frontend/state/session-provider', () => session);

const hidden = vi.hoisted(() => ({
  useHiddenServices: vi.fn(),
}));
vi.mock('@/frontend/state/hidden-services-provider', () => hidden);

import { HiddenServicesView } from '../hidden-services-view';
import { HIDDEN_SERVICES_COPY } from '../hidden-services-copy';

const save = vi.fn();
const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
  hidden.useHiddenServices.mockReturnValue({
    hidden: new Set<string>(),
    status: 'ready',
    reload,
    save,
  });
  save.mockResolvedValue(null);
});

afterEach(cleanup);

describe('HiddenServicesView', () => {
  it('points a guest at sign-in', () => {
    session.useSession.mockReturnValue({ user: null, isLoading: false });
    render(<HiddenServicesView />);

    expect(screen.getByRole('link', { name: HIDDEN_SERVICES_COPY.signIn })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/account/services'
    );
  });

  it('shows a switch per service, on when the service is visible', () => {
    render(<HiddenServicesView />);

    expect(screen.getAllByRole('switch')).toHaveLength(16);
    expect(screen.getByRole('switch', { name: 'إخفاء القرآن الكريم' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('writes the whole set with the toggled route hidden', async () => {
    render(<HiddenServicesView />);

    fireEvent.click(screen.getByRole('switch', { name: 'إخفاء القرآن الكريم' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toContain('/quran');
    expect(save.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('unhides a route the account had hidden', async () => {
    hidden.useHiddenServices.mockReturnValue({
      hidden: new Set(['/quran']),
      status: 'ready',
      reload,
      save,
    });

    render(<HiddenServicesView />);

    expect(screen.getByRole('switch', { name: 'إظهار القرآن الكريم' })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    fireEvent.click(screen.getByRole('switch', { name: 'إظهار القرآن الكريم' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith([]));
  });

  it('says the write failed and leaves the set to the provider', async () => {
    save.mockResolvedValue('تعذَّر الحفظ.');

    render(<HiddenServicesView />);
    fireEvent.click(screen.getByRole('switch', { name: 'إخفاء القرآن الكريم' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذَّر الحفظ.');
  });

  it('offers the needs-connection state when the read failed', async () => {
    hidden.useHiddenServices.mockReturnValue({
      hidden: new Set<string>(),
      status: 'failed',
      reload,
      save,
    });

    render(<HiddenServicesView />);

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(reload).toHaveBeenCalled();
  });
});
