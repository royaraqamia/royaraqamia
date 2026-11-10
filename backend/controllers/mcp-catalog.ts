import * as Sentry from '@sentry/nextjs';

import { runAfter } from '@/backend/config/after';
import { createDefaultMcpCatalogService } from '@/backend/config/mcp';
import { isCronAuthorized } from '@/backend/shared/cron-auth';
import { logger } from '@/backend/shared/logger';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  McpCatalogAdminUpdateSchema,
  McpCatalogSearchQuerySchema,
} from '@/shared/contracts/mcp-catalog';

/**
 * The catalogue's four doors (ADR-0155, phase 2 / #1223): the hourly mirror, the
 * search a member reads, and the two acts an admin performs on a row.
 *
 * The controllers are thin on purpose. The sync's deadline, the probe's cache
 * and the takedown's semantics live in
 * `backend/services/mcp/marketplace/catalog-service.ts`; what happens here is
 * authorisation, parsing, and turning a failure into a sentence.
 */

/** The mirror. `CRON_SECRET` is the only credential, as for every sweep. */
export async function syncMcpCatalog(headers: Headers): Promise<HttpResult> {
  if (!isCronAuthorized(headers)) {
    return jsonResult(401, { success: false, error: 'غير مصرّح' }, { headers: NO_STORE });
  }

  try {
    const result = await createDefaultMcpCatalogService().sync();
    return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(
      500,
      {
        success: false,
        error: error instanceof Error ? error.message : 'تعذّر تحديث المتجر',
      },
      { headers: NO_STORE }
    );
  }
}

/**
 * One page of the catalogue.
 *
 * The rows it draws are the rows worth measuring, so the page's unprobed rows are
 * probed **after** the answer is flushed: a member's search must not wait on five
 * strangers' servers, and the next look at the row has its verdict.
 */
export async function searchMcpCatalog(query: {
  q?: string | null;
  cursor?: string | null;
}): Promise<HttpResult> {
  return withAuthenticatedUser(
    async () => {
      const parsed = McpCatalogSearchQuerySchema.safeParse({
        q: query.q ?? '',
        cursor: query.cursor ?? null,
      });
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: parsed.error.issues[0]?.message ?? 'طلب غير صالح' },
          { headers: NO_STORE }
        );
      }

      const service = createDefaultMcpCatalogService();
      const page = await service.search(parsed.data);

      if (page.servers.length > 0) {
        runAfter(async () => {
          try {
            await service.probe(page.servers.map((row) => row.registryName));
          } catch (error) {
            logger.warn('MCP catalogue: background probe failed', { error: String(error) });
          }
        });
      }

      return jsonResult(200, { success: true, data: page }, { headers: NO_STORE });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل المتجر.' } }
  );
}

/** The takedown list: every row, including the ones the store hides. */
export async function listMcpCatalogForAdmin(query: {
  q?: string | null;
  cursor?: string | null;
}): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = McpCatalogSearchQuerySchema.safeParse({
        q: query.q ?? '',
        cursor: query.cursor ?? null,
      });
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'طلب غير صالح' }, { headers: NO_STORE });
      }

      const page = await createDefaultMcpCatalogService().adminList(parsed.data);
      return jsonResult(200, { success: true, data: page }, { headers: NO_STORE });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل المتجر.' } }
  );
}

/** Block a row with a reason, undo a block, or correct the Arabic it shows. */
export async function updateMcpCatalogRow(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = McpCatalogAdminUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(
          400,
          {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'طلب غير صالح',
            fieldErrors: zodFieldErrors(parsed.error),
          },
          { headers: NO_STORE }
        );
      }

      await createDefaultMcpCatalogService().adminUpdate(parsed.data);
      return jsonResult(200, { success: true }, { headers: NO_STORE });
    },
    { whenFailed: { success: false, error: 'تعذّر حفظ التغيير.' } }
  );
}
