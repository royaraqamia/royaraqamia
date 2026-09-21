import { describe, it, expect, vi } from 'vitest';
import type { NotificationFanout } from '@/backend/config/notifications';
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
