import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ApiError } from '@/frontend/transport/http';

const mocks = vi.hoisted(() => ({ searchUsers: vi.fn() }));

vi.mock('@/frontend/api/admin/users', () => mocks);

import { UserSelect } from '../user-select';

const USER = { id: 'user-1', name: 'سارة', email: 'sara@example.com', avatar_url: null };

describe('UserSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names an unreachable lookup instead of showing an empty picker', async () => {
    mocks.searchUsers.mockRejectedValue(
      new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.')
    );

    render(<UserSelect value={[]} onChange={() => {}} />);

    const state = await screen.findByRole('status');
    expect(state).toHaveTextContent('يتطلَّب الاتصال بالإنترنت');
    expect(state).toHaveTextContent('تعذّر جلب المستخدمين');
  });

  it('re-runs the lookup from that state', async () => {
    mocks.searchUsers.mockRejectedValueOnce(new ApiError('تعذّر الاتصال بالخادم.'));
    render(<UserSelect value={[]} onChange={() => {}} />);

    await screen.findByRole('status');

    mocks.searchUsers.mockResolvedValueOnce([USER]);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => expect(mocks.searchUsers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('keeps a server-answered failure distinct from a lost connection', async () => {
    mocks.searchUsers.mockRejectedValue(new ApiError('غير مصرح', 403));

    render(<UserSelect value={[]} onChange={() => {}} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('غير مصرح');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
