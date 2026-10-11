import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatesRefresh } from '../rates-refresh';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), online: true }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({ isOnline: mocks.online }),
}));

describe('RatesRefresh', () => {
  beforeEach(() => {
    mocks.refresh.mockClear();
    mocks.online = true;
  });

  it('refreshes the board when online', () => {
    render(<RatesRefresh />);
    const button = screen.getByRole('button', { name: 'تحديث الأسعار' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh offline and never calls it', () => {
    mocks.online = false;
    render(<RatesRefresh />);

    const button = screen.getByRole('button', { name: /يحتاج اتصالًا بالإنترنت/ });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
