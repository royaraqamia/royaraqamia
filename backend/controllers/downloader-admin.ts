import { z } from 'zod';
import {
  AddDownloadBlockSchema,
  DOWNLOAD_STATUSES,
  SetDownloadPlatformEnabledSchema,
  UpdateDownloadSettingsSchema,
} from '@/shared/contracts/downloader';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { createDownloaderAdminService } from '@/backend/config/downloader';
import { createStatusGuard, parseAdminListQuery } from '@/backend/controllers/admin-list';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

const isDownloadStatus = createStatusGuard(DOWNLOAD_STATUSES);
const UuidSchema = z.string().uuid();

/** Postgres unique-violation, so a duplicate blocklist entry reads as a 409 not a 500. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

/**
 * The Admin Console's Media Downloader endpoints. Every one runs through
 * `withAdminUser`, so an anonymous caller gets 401 and a signed-in non-admin gets
 * 403 — never a 500 — before any repository is touched.
 */
export async function listDownloadJobs(query: {
  page?: number;
  pageSize?: number;
  status?: string | null;
  search?: string | null;
}): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = parseAdminListQuery(
        Number(query.page ?? 1),
        Number(query.pageSize ?? 0),
        query.status,
        query.search,
        isDownloadStatus
      );
      const page = await createDownloaderAdminService().listJobs(parsed);
      return jsonResult(200, { success: true, ...page });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل طلبات التنزيل.' } }
  );
}

export async function listDownloadBlocklist(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const entries = await createDownloaderAdminService().listBlocklist();
      return jsonResult(200, { success: true, entries });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل قائمة الحظر.' } }
  );
}

export async function addDownloadBlock(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async (identity) => {
      const parsed = AddDownloadBlockSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقّق من القيمة المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }

      try {
        const entry = await createDownloaderAdminService().addBlock({
          kind: parsed.data.kind,
          value: parsed.data.value,
          createdBy: identity.userEmail || null,
        });
        return jsonResult(201, { success: true, entry });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonResult(409, { success: false, error: 'القيمة محظورة بالفعل.' });
        }
        throw error;
      }
    },
    { whenFailed: { success: false, error: 'تعذّر إضافة الحظر.' } }
  );
}

export async function removeDownloadBlock(id: string): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      if (!UuidSchema.safeParse(id).success) {
        return jsonResult(400, { success: false, error: 'معرّف غير صحيح.' });
      }
      await createDownloaderAdminService().removeBlock(id);
      return jsonResult(200, { success: true });
    },
    { whenFailed: { success: false, error: 'تعذّر إزالة الحظر.' } }
  );
}

export async function listDownloadPlatforms(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const platforms = await createDownloaderAdminService().listPlatforms();
      return jsonResult(200, { success: true, platforms });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل المنصّات.' } }
  );
}

export async function setDownloadPlatformEnabled(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = SetDownloadPlatformEnabledSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'قيمة غير صحيحة.' });
      }
      const platform = await createDownloaderAdminService().setPlatformEnabled(
        id,
        parsed.data.enabled
      );
      if (!platform) {
        return jsonResult(404, { success: false, error: 'المنصّة غير معروفة.' });
      }
      return jsonResult(200, { success: true, platform });
    },
    { whenFailed: { success: false, error: 'تعذّر تحديث المنصّة.' } }
  );
}

export async function getDownloaderSettings(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const settings = await createDownloaderAdminService().getSettings();
      return jsonResult(200, { success: true, settings });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل الإعدادات.' } }
  );
}

export async function updateDownloaderSettings(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = UpdateDownloadSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'قيم غير صحيحة.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }
      const settings = await createDownloaderAdminService().updateSettings(parsed.data);
      return jsonResult(200, { success: true, settings });
    },
    { whenFailed: { success: false, error: 'تعذّر حفظ الإعدادات.' } }
  );
}
