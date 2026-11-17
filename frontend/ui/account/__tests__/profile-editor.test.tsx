import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  updateBio: vi.fn(),
  refreshProfile: vi.fn(),
}));

vi.mock('@/frontend/api/me', () => ({
  updateBio: (...args: unknown[]) => mocks.updateBio(...args),
  updateName: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ refreshProfile: mocks.refreshProfile }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ProfileEditor } from '../profile-editor';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateBio.mockResolvedValue({ success: true, bio: 'كاتبة' });
  mocks.refreshProfile.mockResolvedValue(undefined);
});

describe('ProfileEditor bio', () => {
  it('opens the bio dialog, writes the value, and refreshes the session', async () => {
    render(<ProfileEditor userName="أحمد" userEmail="a@b.test" avatarUrl={null} bio={null} />);

    fireEvent.click(screen.getByRole('button', { name: /إضافة نبذة تعريفية/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /النبذة التعريفية/ }), {
      target: { value: 'كاتبة' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() => expect(mocks.updateBio).toHaveBeenCalledWith('كاتبة'));
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('shows the current bio and edits it with the same door', async () => {
    render(<ProfileEditor userName="أحمد" userEmail="a@b.test" avatarUrl={null} bio="كاتب" />);

    expect(screen.getByText('كاتب')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تعديل النبذة/ }));
    expect(screen.getByRole('textbox', { name: /النبذة التعريفية/ })).toHaveValue('كاتب');
  });
});
