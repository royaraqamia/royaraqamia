import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatReportsView } from '../chat-reports-view';
import type { ChatReportRow } from '@/shared/contracts/chat-reports';

const mocks = vi.hoisted(() => ({
  getAdminChatReports: vi.fn(),
  decideAdminChatReport: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/frontend/api/chat-reports', () => ({
  getAdminChatReports: mocks.getAdminChatReports,
  decideAdminChatReport: mocks.decideAdminChatReport,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const REPORT: ChatReportRow = {
  id: 'report-1',
  conversation: { id: 'conversation-1', kind: 'group', title: 'فريق التصميم' },
  reporter: { id: 'u1', username: 'sara', name: 'سارة' },
  reportedUser: { id: 'u2', username: 'bad', name: 'خالد' },
  reason: 'إساءة في الحديث',
  status: 'open',
  createdAt: '2026-11-05T10:00:00.000Z',
  snapshot: [
    {
      id: 'm1',
      senderId: 'u2',
      senderKind: 'user',
      body: 'رسالة مسيئة',
      createdAt: '2026-11-05T09:58:00.000Z',
      deleted: false,
    },
    {
      id: 'm2',
      senderId: 'u1',
      senderKind: 'user',
      body: 'ردّي أنا',
      createdAt: '2026-11-05T09:59:00.000Z',
      deleted: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminChatReports.mockResolvedValue([REPORT]);
});

describe('ChatReportsView', () => {
  it('lists the report with both members, its reason and the frozen snapshot', async () => {
    render(<ChatReportsView />);

    expect(await screen.findByText('بلاغ من سارة عن خالد')).toBeInTheDocument();
    expect(screen.getByText('إساءة في الحديث')).toBeInTheDocument();
    expect(screen.getByText('رسالة مسيئة')).toBeInTheDocument();
    expect(screen.getByText('صاحب البلاغ')).toBeInTheDocument();
    expect(screen.getByText('المذكور في البلاغ')).toBeInTheDocument();
  });

  it('marks a deleted line as a tombstone instead of drawing its body', async () => {
    render(<ChatReportsView />);

    expect(await screen.findByText('رسالة محذوفة')).toBeInTheDocument();
  });

  it('shows the empty state when the queue has no reports', async () => {
    mocks.getAdminChatReports.mockResolvedValue([]);

    render(<ChatReportsView />);

    expect(await screen.findByText('لا إبلاغات')).toBeInTheDocument();
  });

  it('records a report as reviewed and drops it from the open filter', async () => {
    mocks.decideAdminChatReport.mockResolvedValue({ ...REPORT, status: 'reviewed' });

    render(<ChatReportsView />);
    await screen.findByText('بلاغ من سارة عن خالد');

    fireEvent.click(screen.getByRole('button', { name: 'تحديد كمُراجَع' }));

    await waitFor(() =>
      expect(mocks.decideAdminChatReport).toHaveBeenCalledWith('report-1', 'reviewed')
    );
    await waitFor(() => expect(screen.queryByText('بلاغ من سارة عن خالد')).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('names the failure and offers a retry when the queue cannot load', async () => {
    mocks.getAdminChatReports.mockRejectedValue(new Error('down'));

    render(<ChatReportsView />);

    expect(await screen.findByText('تعذّر تحميل الإبلاغات.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});
