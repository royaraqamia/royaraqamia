import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpUserContext } from '../session';
import {
  createCertificateHandler,
  updateCertificateHandler,
  deleteCertificateHandler,
  listCertificatesHandler,
  getCertificateHandler,
} from '../tools/certificates';
import { effectiveScopes } from '../scope';

const adminCtx: McpUserContext = {
  userId: 'u1',
  email: 'admin@example.com',
  isAdmin: true,
  scopes: ['certificates.write', 'admin'],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const nonAdminCtx: McpUserContext = {
  userId: 'u2',
  email: 'user@example.com',
  isAdmin: false,
  scopes: ['certificates.write'],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

const noScopeCtx: McpUserContext = { ...adminCtx, scopes: [] };

const sampleCertificate = {
  id: 'c1',
  certificate_code: 'COMP-2026-A1B2C3D4',
  student_name: 'أحمد',
  course_name: 'برمجة الويب',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: 'ممتاز',
  recipient_email: null,
  recipient_user_ids: [],
  created_at: '2026-01-01T00:00:00.000Z',
};

// One import of the tools module, with the repository and service it reaches
// for replaced once for the whole file. Re-running `vi.resetModules()` plus a
// fresh dynamic import per case re-built this module graph (and its zod
// schemas) ten times, which pushed the first case past Vitest's 5s default
// under parallel load — see #194. The service mock is reset, not re-imported.
const service = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getById: vi.fn(),
}));

vi.mock('@/backend/repositories/certificates', () => ({
  createCertificatesRepository: vi.fn(),
}));

vi.mock('@/backend/services/certificates/certificates-service', () => ({
  CertificatesService: class {
    create = service.create;
    update = service.update;
    delete = service.delete;
    list = service.list;
    getById = service.getById;
  },
}));

describe('admin certificate tools', () => {
  beforeEach(() => {
    service.create.mockReset().mockResolvedValue(sampleCertificate);
    service.update.mockReset().mockResolvedValue({ ...sampleCertificate, student_name: 'مريم' });
    service.delete.mockReset().mockResolvedValue(undefined);
    service.list.mockReset().mockResolvedValue({ data: [sampleCertificate], total: 1 });
    service.getById.mockReset().mockResolvedValue(sampleCertificate);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('createCertificateHandler requires certificates.write scope', async () => {
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      noScopeCtx
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('createCertificateHandler rejects non-admin users even with the scope', async () => {
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      nonAdminCtx
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('requires the scope');
  });

  it('createCertificateHandler issues via the service for admins', async () => {
    const result = await createCertificateHandler(
      {
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        issue_date: '2026-01-01',
        format: 'json',
      },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        student_name: 'أحمد',
        course_name: 'برمجة الويب',
        recipient_user_ids: [],
      }),
      undefined,
      'u1'
    );
    expect(result.structuredContent?.certificate_code).toBe('COMP-2026-A1B2C3D4');
  });

  it('updateCertificateHandler merges partial fields', async () => {
    const result = await updateCertificateHandler(
      { id: 'c1', student_name: 'مريم', format: 'json' },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(service.getById).toHaveBeenCalledWith('c1');
    expect(service.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ student_name: 'مريم', course_name: 'برمجة الويب' })
    );
    expect(result.structuredContent?.message).toContain('updated');
  });

  it('updateCertificateHandler reports a missing certificate', async () => {
    service.getById.mockResolvedValue(null);

    const result = await updateCertificateHandler({ id: 'missing', format: 'json' }, adminCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No certificate found');
  });

  it('deleteCertificateHandler deletes for admins', async () => {
    const result = await deleteCertificateHandler({ id: 'c1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(service.delete).toHaveBeenCalledWith('c1');
    expect(result.structuredContent?.message).toContain('deleted');
  });

  it('listCertificatesHandler lists with pagination', async () => {
    const result = await listCertificatesHandler(
      { page: 1, page_size: 20, format: 'json' },
      adminCtx
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.meta).toMatchObject({ page: 1, page_size: 20, total: 1 });
    expect(result.structuredContent?.certificates).toHaveLength(1);
  });

  it('getCertificateHandler returns the public shape', async () => {
    const result = await getCertificateHandler({ id: 'c1', format: 'json' }, adminCtx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.certificate_code).toBe('COMP-2026-A1B2C3D4');
    expect(result.structuredContent?.recipient_email).toBeUndefined();
  });

  it('getCertificateHandler reports a missing certificate', async () => {
    service.getById.mockResolvedValue(null);

    const result = await getCertificateHandler({ id: 'missing', format: 'json' }, adminCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No certificate found');
  });

  it('admin tools require an admin in effectiveScopes', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    expect(effectiveScopes('user@example.com', ['certificates.write', 'community.read'])).toEqual([
      'community.read',
    ]);
    expect(
      effectiveScopes('admin@example.com', ['certificates.write', 'admin', 'community.read'])
    ).toEqual(['certificates.write', 'admin', 'community.read']);
  });
});
