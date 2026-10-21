import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { ApiError } from '@/frontend/transport/http';

const api = vi.hoisted(() => ({
  getMyProjectRequests: vi.fn(),
  getMyRetainers: vi.fn(),
  getMyTrainingApplications: vi.fn(),
  getMyConsultationBookings: vi.fn(),
}));

vi.mock('@/frontend/api/project-requests', () => api);
vi.mock('@/frontend/api/retainers', () => api);
vi.mock('@/frontend/api/training', () => api);
vi.mock('@/frontend/api/consultation', () => api);

const session = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => session);

vi.mock('./project-request-edit-form', () => ({ ProjectRequestEditForm: () => null }));
vi.mock('./retainer-edit-form', () => ({ RetainerEditForm: () => null }));
vi.mock('./training-application-edit-form', () => ({ TrainingApplicationEditForm: () => null }));
vi.mock('./consultation-booking-edit-form', () => ({ ConsultationBookingEditForm: () => null }));

import { MySubmissionsView } from '../my-submissions-view';

const REQUEST = {
  id: 'r1',
  project_type: 'app',
  reference_code: 'PRJ-2026-A7K2M9QX',
  status: 'quoted',
  description: 'طلب مشروع.',
  created_at: '2026-10-01T10:00:00.000Z',
  edited_at: null,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
  api.getMyProjectRequests.mockResolvedValue([REQUEST]);
  api.getMyRetainers.mockResolvedValue([]);
  api.getMyTrainingApplications.mockResolvedValue([]);
  api.getMyConsultationBookings.mockResolvedValue([]);
});

afterEach(cleanup);

describe('MySubmissionsView', () => {
  it('points a guest at sign-in without reading the lists', async () => {
    session.useSession.mockReturnValue({ user: null, isLoading: false });
    render(<MySubmissionsView />);

    expect(await screen.findByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/account/submissions'
    );
    expect(api.getMyProjectRequests).not.toHaveBeenCalled();
  });

  it('holds the skeleton while the session is still being read', () => {
    session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: true });
    render(<MySubmissionsView />);

    expect(screen.getByLabelText('جاري تحميل طلباتك')).toBeInTheDocument();
    expect(api.getMyProjectRequests).not.toHaveBeenCalled();
  });

  it('lists the submitted rows with their kinds and statuses', async () => {
    render(<MySubmissionsView />);

    expect(await screen.findByText('تطبيق (مع Backend)')).toBeInTheDocument();
    expect(screen.getByText('PRJ-2026-A7K2M9QX')).toBeInTheDocument();
    expect(screen.getByText('تمَّ إرسال العرض')).toBeInTheDocument();
  });

  it('renders the empty state for a genuinely empty feed', async () => {
    api.getMyProjectRequests.mockResolvedValue([]);
    render(<MySubmissionsView />);

    expect(await screen.findByText('لا توجد طلبات بعد')).toBeInTheDocument();
  });

  it('names the connection when a read never reached the server', async () => {
    api.getMyRetainers.mockRejectedValue(
      new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.')
    );
    render(<MySubmissionsView />);

    expect(await screen.findByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد طلبات بعد')).not.toBeInTheDocument();

    api.getMyRetainers.mockResolvedValue([]);
    api.getMyProjectRequests.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByText('لا توجد طلبات بعد')).toBeInTheDocument();
  });

  it('renders the ordinary error card for a server-answered failure', async () => {
    api.getMyProjectRequests.mockRejectedValue(new ApiError('غير مصرح', 401));
    render(<MySubmissionsView />);

    expect(await screen.findByText('تعذّر تحميل طلباتك.')).toBeInTheDocument();
    await waitFor(() => expect(api.getMyRetainers).toHaveBeenCalled());
    expect(screen.queryByText('يتطلَّب الاتصال بالإنترنت')).not.toBeInTheDocument();
  });
});
