import { describe, it, expect, vi } from 'vitest';
import {
  createNotificationFanout,
  type NotificationDelivery,
  type NotificationFanout,
  type PushNotifier,
} from '@/backend/config/notifications';
import { createTrainingApplicationNotifier } from '@/backend/config/training';
import { createConsultationBookingNotifier } from '@/backend/config/consultation';
import { createPostPublishedNotifier } from '@/backend/config/blogpress';
import { createCertificateIssuedNotifier } from '@/backend/config/certificates';
import { TRAINING_COURSE, type TrainingApplication } from '@/shared/contracts/training';
import type { Certificate } from '@/shared/contracts/certificates';

function makeFanout() {
  return vi.fn<NotificationFanout>(async () => 1);
}

const application: TrainingApplication = {
  id: 'app-1',
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  goal: 'أريد بناء متجر إلكتروني.',
  reference_code: 'TRN-2026-A7K2M9QX',
  status: 'new',
  notes: null,
  user_id: null,
  created_at: '2026-09-16T00:00:00.000Z',
  updated_at: '2026-09-16T00:00:00.000Z',
};

const certificate: Certificate = {
  id: 'cert-1',
  certificate_code: 'COMP-2026-ABCDEFGH',
  student_name: 'سارة العلي',
  course_name: 'إدارة المتاجر الإلكترونية',
  issue_date: '2026-09-16',
  expiration_date: null,
  grade_or_status: null,
  recipient_email: null,
  recipient_user_ids: ['u-1', 'u-2'],
  created_by: 'admin-1',
  created_at: '2026-09-16T00:00:00.000Z',
};

describe('notification producer adapters', () => {
  it('hands the training notification to the Admin audience with no target set', () => {
    const fanout = makeFanout();

    createTrainingApplicationNotifier(fanout)(application);

    expect(fanout).toHaveBeenCalledTimes(1);
    expect(fanout.mock.calls[0]?.[0]).toEqual({
      type: 'training_application',
      title: 'طلب التحاق جديد بالدورة',
      body: `أحمد العلي — ${TRAINING_COURSE.title} (TRN-2026-A7K2M9QX)`,
      metadata: {
        applicationId: 'app-1',
        referenceCode: 'TRN-2026-A7K2M9QX',
        courseSlug: 'build-digital-products',
      },
    });
    expect(fanout.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('hands the consultation notification to the Admin audience with no target set', () => {
    const fanout = makeFanout();

    createConsultationBookingNotifier(fanout)({
      id: 'booking-1',
      referenceCode: 'CONS-2026-A7K2M9QX',
      fullName: 'سارة',
      packageName: null,
    });

    expect(fanout.mock.calls[0]?.[0]).toEqual({
      type: 'consultation_booking',
      title: 'طلب حجز استشارة جديد',
      body: 'سارة — استشارة (CONS-2026-A7K2M9QX)',
      metadata: { bookingId: 'booking-1', referenceCode: 'CONS-2026-A7K2M9QX' },
    });
    expect(fanout.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('names the selected consultation package in the body', () => {
    const fanout = makeFanout();

    createConsultationBookingNotifier(fanout)({
      id: 'booking-1',
      referenceCode: 'CONS-2026-A7K2M9QX',
      fullName: 'سارة',
      packageName: 'استشارة أعمال',
    });

    expect(fanout.mock.calls[0]?.[0].body).toBe('سارة — استشارة أعمال (CONS-2026-A7K2M9QX)');
  });

  it('excludes the publishing author from a post-published notice', () => {
    const fanout = makeFanout();

    createPostPublishedNotifier(fanout)({ postId: 'post-1', authorId: 'author-1', slug: 'hello' });

    expect(fanout).toHaveBeenCalledTimes(1);
    expect(fanout.mock.calls[0]?.[0]).toEqual({
      type: 'post_published',
      title: 'تم نشر مقال جديد',
      body: 'تم نشر مقال جديد على المدونة.',
      metadata: { postId: 'post-1', slug: 'hello' },
    });
    expect(fanout.mock.calls[0]?.[1]).toEqual({ excludeUserIds: ['author-1'] });
  });

  it('hands certificate recipients to the fan-out as explicit recipients', () => {
    const fanout = makeFanout();

    createCertificateIssuedNotifier(fanout)({
      recipientUserIds: ['u-1', 'u-2'],
      certificate,
    });

    expect(fanout.mock.calls[0]?.[0]).toEqual({
      type: 'certificate_issued',
      title: 'تمَّ إصدار شهادة لك',
      body: 'شهادة "إدارة المتاجر الإلكترونية" باسم سارة العلي صادرة عن رؤيَة رقَميَّة.',
      metadata: {
        certificateId: 'cert-1',
        certificateCode: 'COMP-2026-ABCDEFGH',
        courseName: 'إدارة المتاجر الإلكترونية',
      },
    });
    expect(fanout.mock.calls[0]?.[1]).toEqual({ recipientIds: ['u-1', 'u-2'] });
  });

  it('hands an empty recipient set to the fan-out rather than falling back to an audience', () => {
    const fanout = makeFanout();

    createCertificateIssuedNotifier(fanout)({ recipientUserIds: [], certificate });

    expect(fanout.mock.calls[0]?.[1]).toEqual({ recipientIds: [] });
  });
});

describe('consultation booking burst', () => {
  it('produces one broadcast per booking over the whole Admin audience, never one per Admin', async () => {
    const admins = ['admin-1', 'admin-2', 'admin-3'];
    const broadcast = vi.fn<NotificationDelivery['broadcast']>(
      async (_input, userIds) => userIds.length
    );
    const sendToUsers = vi.fn<PushNotifier['sendToUsers']>(async () => undefined);
    const fanout = createNotificationFanout({
      deliver: { broadcast },
      push: { sendToUsers },
      resolveAdminIds: async () => admins,
      schedule: (task) => {
        void task();
      },
    });
    const notify = createConsultationBookingNotifier(fanout);

    notify({ id: 'booking-1', referenceCode: 'CONS-2026-A1', fullName: 'سارة', packageName: null });
    notify({ id: 'booking-2', referenceCode: 'CONS-2026-A2', fullName: 'سارة', packageName: null });
    notify({ id: 'booking-3', referenceCode: 'CONS-2026-A3', fullName: 'سارة', packageName: null });

    await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalledTimes(3));

    // 3 bookings, not 3 bookings × 3 Admins = 9 inserts; each covers everyone.
    for (const call of broadcast.mock.calls) expect(call[1]).toEqual(admins);
    for (const call of sendToUsers.mock.calls) {
      expect(call[0]).toEqual(admins);
      // The notice's type, title and deep-link are unchanged.
      expect(call[1]).toMatchObject({
        type: 'consultation_booking',
        title: 'طلب حجز استشارة جديد',
        url: '/admin/consultations/bookings',
      });
    }
    expect(sendToUsers.mock.calls.map((call) => call[1].body).sort()).toEqual([
      'سارة — استشارة (CONS-2026-A1)',
      'سارة — استشارة (CONS-2026-A2)',
      'سارة — استشارة (CONS-2026-A3)',
    ]);
  });
});

describe('post-published burst', () => {
  it('produces one broadcast per publish over the whole Admin audience minus the author', async () => {
    const admins = ['author-1', 'admin-2', 'admin-3'];
    const audience = ['admin-2', 'admin-3'];
    const broadcast = vi.fn<NotificationDelivery['broadcast']>(
      async (_input, userIds) => userIds.length
    );
    const sendToUsers = vi.fn<PushNotifier['sendToUsers']>(async () => undefined);
    const fanout = createNotificationFanout({
      deliver: { broadcast },
      push: { sendToUsers },
      resolveAdminIds: async () => admins,
      schedule: (task) => {
        void task();
      },
    });
    const notify = createPostPublishedNotifier(fanout);

    notify({ postId: 'post-1', authorId: 'author-1', slug: 'hello-1' });
    notify({ postId: 'post-2', authorId: 'author-1', slug: 'hello-2' });
    notify({ postId: 'post-3', authorId: 'author-1', slug: 'hello-3' });

    await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalledTimes(3));

    // 3 publishes, not 3 × 3 Admins = 9 inserts; every broadcast covers the
    // whole audience with the publishing author subtracted.
    for (const call of broadcast.mock.calls) {
      expect(call[1]).toEqual(audience);
      expect(call[0]).toMatchObject({
        type: 'post_published',
        title: 'تم نشر مقال جديد',
        body: 'تم نشر مقال جديد على المدونة.',
      });
    }
    for (const call of sendToUsers.mock.calls) {
      expect(call[0]).toEqual(audience);
      // The notice's type, title and body are unchanged; the deep-link follows.
      expect(call[1]).toMatchObject({
        type: 'post_published',
        title: 'تم نشر مقال جديد',
        body: 'تم نشر مقال جديد على المدونة.',
      });
    }
    expect(broadcast.mock.calls.map((call) => call[0].metadata?.postId).sort()).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);
    expect(sendToUsers.mock.calls.map((call) => call[1].url).sort()).toEqual([
      '/blog/hello-1',
      '/blog/hello-2',
      '/blog/hello-3',
    ]);
  });
});
