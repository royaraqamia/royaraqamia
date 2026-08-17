import { describe, it, expect, vi } from 'vitest';
import {
  CertificatesService,
  CertificateValidationError,
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
} from '@/backend/services/certificates/certificates-service';
import type { CertificatesRepository } from '@/backend/repositories/certificates/certificates-repository';
import type { Certificate } from '@/shared/contracts/certificates';

const validInput = {
  student_name: 'أحمد محمد',
  course_name: 'برمجة الويب',
  issue_date: '2026-01-01',
};

const sampleCertificate = {
  id: '1',
  certificate_code: 'COMP-2026-A1B2C3D4',
  student_name: 'أحمد محمد',
  course_name: 'برمجة الويب',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: null,
  created_at: '2026-01-01',
} as unknown as Certificate;

function makeRepo(overrides: Partial<CertificatesRepository> = {}) {
  const repository: CertificatesRepository = {
    getByCode: vi.fn(),
    getCodes: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
  return { repository, service: new CertificatesService(repository) };
}

function makeRepoWithNotifier(
  onCertificateIssued: (info: { recipientUserIds: string[]; certificate: Certificate }) => void
) {
  const repository: CertificatesRepository = {
    getByCode: vi.fn(),
    getCodes: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { repository, service: new CertificatesService(repository, onCertificateIssued) };
}

describe('CertificatesService', () => {
  describe('list / getById / delete (delegation)', () => {
    it('delegates list to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.list as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [sampleCertificate],
        total: 1,
      });
      await expect(service.list(2, 10, 'search')).resolves.toEqual({
        data: [sampleCertificate],
        total: 1,
      });
      expect(repository.list).toHaveBeenCalledWith(2, 10, 'search');
    });

    it('delegates getById to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);
      await expect(service.getById('1')).resolves.toBe(sampleCertificate);
      expect(repository.getById).toHaveBeenCalledWith('1');
    });

    it('delegates delete to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.delete('1');
      expect(repository.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('create', () => {
    it('creates a certificate with a valid generated code', async () => {
      const { repository, service } = makeRepo();
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      const result = await service.create(validInput);

      expect(result).toBe(sampleCertificate);
      const created = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(created.certificate_code).toMatch(/^COMP-\d{4}-[A-Z0-9]{8}$/);
      expect(created.student_name).toBe('أحمد محمد');
      expect(created.expiration_date).toBeNull();
      expect(created.grade_or_status).toBeNull();
    });

    it('uses and uppercases a custom code', async () => {
      const { repository, service } = makeRepo();
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      await service.create(validInput, '  comp-2026-a1b2c3d4  ');

      const created = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(created.certificate_code).toBe('COMP-2026-A1B2C3D4');
    });

    it('passes through expiration_date and grade_or_status when provided', async () => {
      const { repository, service } = makeRepo();
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      await service.create({
        ...validInput,
        expiration_date: '2027-01-01',
        grade_or_status: 'ممتاز',
      });

      const created = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(created.expiration_date).toBe('2027-01-01');
      expect(created.grade_or_status).toBe('ممتاز');
    });

    it('throws CertificateValidationError for a short student name', async () => {
      const { service } = makeRepo();
      await expect(service.create({ ...validInput, student_name: 'أ' })).rejects.toMatchObject({
        name: 'CertificateValidationError',
        fieldErrors: { student_name: 'اسم الطالب قصير جداً' },
      });
    });

    it('throws CertificateValidationError for a too-long course name', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, course_name: 'أ'.repeat(201) })
      ).rejects.toMatchObject({
        name: 'CertificateValidationError',
        fieldErrors: { course_name: 'اسم الدورة طويل جداً' },
      });
    });

    it('accepts a boundary-length name (200 chars)', async () => {
      const { repository, service } = makeRepo();
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);
      await expect(service.create({ ...validInput, student_name: 'أ'.repeat(200) })).resolves.toBe(
        sampleCertificate
      );
    });

    it('rejects an invalid issue_date', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, issue_date: 'not-a-date' })
      ).rejects.toMatchObject({ name: 'CertificateValidationError' });
    });

    it('rejects an invalid expiration_date', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, expiration_date: 'not-a-date' })
      ).rejects.toMatchObject({ name: 'CertificateValidationError' });
    });

    it('rejects expiration_date that is not after issue_date', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, issue_date: '2026-06-01', expiration_date: '2026-01-01' })
      ).rejects.toMatchObject({
        name: 'CertificateValidationError',
        fieldErrors: { expiration_date: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار' },
      });
    });

    it('accepts expiration_date equal to issue_date boundary is rejected (must be after)', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, issue_date: '2026-06-01', expiration_date: '2026-06-01' })
      ).rejects.toBeInstanceOf(CertificateValidationError);
    });

    it('rejects a grade_or_status over 100 chars', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, grade_or_status: 'أ'.repeat(101) })
      ).rejects.toBeInstanceOf(CertificateValidationError);
    });

    it('throws CertificateCodeFormatError for a malformed custom code', async () => {
      const { service } = makeRepo();
      await expect(service.create(validInput, 'BAD CODE')).rejects.toBeInstanceOf(
        CertificateCodeFormatError
      );
      await expect(service.create(validInput, 'COMP-26-A1B2C3D4')).rejects.toBeInstanceOf(
        CertificateCodeFormatError
      );
      await expect(service.create(validInput, 'COMP-2026-A1B2C')).rejects.toBeInstanceOf(
        CertificateCodeFormatError
      );
    });

    it('throws CertificateDuplicateCodeError when the repository reports a unique violation', async () => {
      const { repository, service } = makeRepo();
      (repository.create as ReturnType<typeof vi.fn>).mockRejectedValue({ code: '23505' });

      await expect(service.create(validInput, 'COMP-2026-A1B2C3D4')).rejects.toBeInstanceOf(
        CertificateDuplicateCodeError
      );
    });

    it('re-throws unexpected database errors', async () => {
      const { repository, service } = makeRepo();
      const dbError = new Error('connection refused');
      (repository.create as ReturnType<typeof vi.fn>).mockRejectedValue(dbError);

      await expect(service.create(validInput)).rejects.toThrow('connection refused');
    });
  });

  describe('update', () => {
    it('delegates a valid update to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      await service.update('1', validInput);

      expect(repository.getById).toHaveBeenCalledWith('1');
      expect(repository.update).toHaveBeenCalledWith('1', {
        student_name: 'أحمد محمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        expiration_date: null,
        grade_or_status: null,
        recipient_email: null,
        recipient_user_ids: [],
      });
    });

    it('throws CertificateValidationError on invalid update data', async () => {
      const { service } = makeRepo();
      await expect(service.update('1', { ...validInput, student_name: '' })).rejects.toBeInstanceOf(
        CertificateValidationError
      );
    });
  });

  describe('certificate_issued notifier', () => {
    const userId = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';

    it('fires the notifier with the recipient user ids after a successful create', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      const result = await service.create({ ...validInput, recipient_user_ids: [userId] });

      expect(result).toBeDefined();
      expect(onCertificateIssued).toHaveBeenCalledWith({
        recipientUserIds: [userId],
        certificate: sampleCertificate,
      });
    });

    it('does not fire the notifier when no recipient ids are provided', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      await service.create(validInput);

      expect(onCertificateIssued).not.toHaveBeenCalled();
    });

    it('does not fire the notifier when the ids array is empty', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCertificate);

      await service.create({ ...validInput, recipient_user_ids: [] });

      expect(onCertificateIssued).not.toHaveBeenCalled();
    });

    it('rejects an invalid recipient user id', async () => {
      const { service } = makeRepo();
      await expect(
        service.create({ ...validInput, recipient_user_ids: ['not-a-uuid'] })
      ).rejects.toMatchObject({
        fieldErrors: { recipient_user_ids: 'معرّف مستخدم غير صالح' },
      });
    });
  });

  describe('update notifier', () => {
    const userIdA = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';
    const userIdB = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

    it('notifies only newly added recipient ids on update', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA],
      });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA, userIdB],
      });

      await service.update('1', { ...validInput, recipient_user_ids: [userIdA, userIdB] });

      expect(onCertificateIssued).toHaveBeenCalledTimes(1);
      expect(onCertificateIssued).toHaveBeenCalledWith({
        recipientUserIds: [userIdB],
        certificate: { ...sampleCertificate, recipient_user_ids: [userIdA, userIdB] },
      });
    });

    it('does not notify when recipient ids are unchanged', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA],
      });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA],
      });

      await service.update('1', { ...validInput, recipient_user_ids: [userIdA] });

      expect(onCertificateIssued).not.toHaveBeenCalled();
    });

    it('does not notify when recipients are removed', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA],
      });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [],
      });

      await service.update('1', { ...validInput, recipient_user_ids: [] });

      expect(onCertificateIssued).not.toHaveBeenCalled();
    });

    it('notifies when recipients are added to a certificate that had none', async () => {
      const onCertificateIssued = vi.fn();
      const { repository, service } = makeRepoWithNotifier(onCertificateIssued);
      (repository.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [],
      });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...sampleCertificate,
        recipient_user_ids: [userIdA],
      });

      await service.update('1', { ...validInput, recipient_user_ids: [userIdA] });

      expect(onCertificateIssued).toHaveBeenCalledTimes(1);
      expect(onCertificateIssued).toHaveBeenCalledWith({
        recipientUserIds: [userIdA],
        certificate: { ...sampleCertificate, recipient_user_ids: [userIdA] },
      });
    });
  });
});
