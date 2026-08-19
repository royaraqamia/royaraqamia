import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId, requireAdmin } from './guards';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
import { CertificatesService } from '@/backend/services/certificates/certificates-service';
import { toPublicCertificate } from '@/shared/contracts/certificates';
import { formatDate } from './shared';
import { PAGE_SIZE_SCHEMA } from './shared';

/**
 * Certificates tools. `verify` is public (certificates RLS is `USING (true)`),
 * so it works for anonymous callers. Listing your own certificates uses
 * recipient_user_ids, which only the owner can see under the app's access model.
 */

const VerifyInputSchema = z
  .object({
    code: z
      .string()
      .regex(/^COMP-\d{4}-[A-Z0-9]{8}$/)
      .describe('Certificate code, e.g. COMP-2026-A1B2C3D4'),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

const ListMineInputSchema = z
  .object({
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

type VerifyInput = z.infer<typeof VerifyInputSchema>;
type ListMineInput = z.infer<typeof ListMineInputSchema>;

export async function verifyCertificateHandler(
  params: VerifyInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    const repo = createCertificatesRepository(ctx.supabase as never);
    const certificate = await repo.getByCode(params.code);

    if (!certificate) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No certificate found for code "${params.code}".` }],
      };
    }

    const publicCertificate = toPublicCertificate(certificate);

    if (params.format === 'json') {
      return structuredResponse(jsonText(publicCertificate), publicCertificate);
    }

    const lines = [
      `# Certificate Verified`,
      '',
      `- **Code**: ${publicCertificate.certificate_code}`,
      `- **Student**: ${publicCertificate.student_name}`,
      `- **Course**: ${publicCertificate.course_name}`,
      `- **Issued**: ${formatDate(publicCertificate.issue_date)}`,
      `- **Expires**: ${
        publicCertificate.expiration_date ? formatDate(publicCertificate.expiration_date) : 'Never'
      }`,
      publicCertificate.grade_or_status
        ? `- **Grade/Status**: ${publicCertificate.grade_or_status}`
        : null,
      '',
      'This certificate is valid and was issued by رؤية رقمية.',
    ].filter((line): line is string => line !== null);

    return structuredResponse(lines.join('\n'), publicCertificate);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function listMineHandler(
  params: ListMineInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.read']);
    const userId = requireUserId(ctx, 'Listing your certificates');
    const repo = createCertificatesRepository(ctx.supabase as never);
    const certificates = await repo.listByRecipient(userId);

    const items = certificates.map((c) => toPublicCertificate(c));

    if (params.format === 'json') {
      return structuredResponse(jsonText({ certificates: items }), { certificates: items });
    }

    const lines = [
      '# Your Certificates',
      '',
      `Found ${items.length} certificate${items.length === 1 ? '' : 's'}.`,
      '',
    ];
    for (const c of items) {
      lines.push(`- **${c.student_name}** — ${c.course_name} (\`${c.certificate_code}\`)`);
    }
    return structuredResponse(lines.join('\n'), { certificates: items });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerCertificateTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_verify`,
    {
      title: 'Verify Certificate',
      description: `Verifies a certificate by its code. Works anonymously — no scope or authentication required. Returns the certificate's public details.

Args:
  - code (string, required): certificate code in the format COMP-YYYY-XXXXXXXX
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "certificate_code": string, "student_name": string, "course_name": string, "issue_date": string, "expiration_date": string|null, "grade_or_status": string|null, "created_at": string }

Examples:
  - Use when: "verify certificate COMP-2026-A1B2C3D4" -> code="COMP-2026-A1B2C3D4"`,
      inputSchema: VerifyInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => verifyCertificateHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_list_mine`,
    {
      title: 'List My Certificates',
      description: `Lists the certificates issued to you. Requires the "certificates.read" scope and an authenticated session.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "certificates": PublicCertificate[] }

Examples:
  - Use when: "show me my certificates"`,
      inputSchema: ListMineInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listMineHandler(params, ctx)
  );
}

// ============================================================
// Admin tools (certificates.write — admin only)
// ============================================================

const DATE_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date in YYYY-MM-DD format');

const USER_IDS_SCHEMA = z
  .array(z.string().min(1))
  .max(50)
  .describe('Recipient user ids (users who should receive this certificate)');

const CreateCertificateInputSchema = z
  .object({
    student_name: z.string().trim().min(2).max(200).describe('Student name'),
    course_name: z.string().trim().min(2).max(200).describe('Course name'),
    issue_date: DATE_SCHEMA,
    expiration_date: DATE_SCHEMA.nullable().optional().describe('Optional expiration date'),
    grade_or_status: z.string().trim().max(100).nullable().optional().describe('Grade or status'),
    recipient_email: z
      .string()
      .trim()
      .email()
      .nullable()
      .optional()
      .describe('Optional recipient email'),
    recipient_user_ids: USER_IDS_SCHEMA.optional().describe('Optional recipient user ids'),
    custom_code: z
      .string()
      .regex(/^COMP-\d{4}-[A-Z0-9]{8}$/)
      .optional()
      .describe('Optional custom certificate code; auto-generated if omitted'),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

const UpdateCertificateInputSchema = z
  .object({
    id: z.string().min(1).describe('Certificate id'),
    student_name: z.string().trim().min(2).max(200).optional(),
    course_name: z.string().trim().min(2).max(200).optional(),
    issue_date: DATE_SCHEMA.optional(),
    expiration_date: DATE_SCHEMA.nullable().optional(),
    grade_or_status: z.string().trim().max(100).nullable().optional(),
    recipient_email: z.string().trim().email().nullable().optional(),
    recipient_user_ids: USER_IDS_SCHEMA.optional(),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

const DeleteCertificateInputSchema = z
  .object({
    id: z.string().min(1).describe('Certificate id to delete'),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

const ListCertificatesInputSchema = z
  .object({
    page: z.number().int().min(1).default(1).describe('Page number, 1-based'),
    page_size: PAGE_SIZE_SCHEMA,
    search: z.string().trim().optional().describe('Optional search across name, course, code'),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

const GetCertificateInputSchema = z
  .object({
    id: z.string().min(1).describe('Certificate id'),
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

type CreateCertificateInput = z.infer<typeof CreateCertificateInputSchema>;
type UpdateCertificateInput = z.infer<typeof UpdateCertificateInputSchema>;
type DeleteCertificateInput = z.infer<typeof DeleteCertificateInputSchema>;
type ListCertificatesInput = z.infer<typeof ListCertificatesInputSchema>;
type GetCertificateInput = z.infer<typeof GetCertificateInputSchema>;

function createAdminCertificatesService(supabase: never): CertificatesService {
  return new CertificatesService(createCertificatesRepository(supabase as never));
}

export async function createCertificateHandler(
  params: CreateCertificateInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.write']);
    requireAdmin(ctx);
    const service = createAdminCertificatesService(ctx.supabase as never);

    const certificate = await service.create(
      {
        student_name: params.student_name,
        course_name: params.course_name,
        issue_date: params.issue_date,
        expiration_date: params.expiration_date ?? undefined,
        grade_or_status: params.grade_or_status ?? undefined,
        recipient_email: params.recipient_email ?? undefined,
        recipient_user_ids: params.recipient_user_ids ?? [],
      },
      params.custom_code
    );

    const output = {
      id: certificate.id,
      certificate_code: certificate.certificate_code,
      student_name: certificate.student_name,
      course_name: certificate.course_name,
      message: 'Certificate issued.',
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Certificate Issued\n\n**${certificate.student_name}** — ${certificate.course_name}\nCode: \`${certificate.certificate_code}\` (\`${certificate.id}\`)`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function updateCertificateHandler(
  params: UpdateCertificateInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.write']);
    requireAdmin(ctx);
    const service = createAdminCertificatesService(ctx.supabase as never);

    const existing = await service.getById(params.id);
    if (!existing) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No certificate found for id "${params.id}".` }],
      };
    }

    const certificate = await service.update(params.id, {
      student_name: params.student_name ?? existing.student_name,
      course_name: params.course_name ?? existing.course_name,
      issue_date: params.issue_date ?? existing.issue_date,
      expiration_date:
        params.expiration_date === null
          ? undefined
          : (params.expiration_date ?? existing.expiration_date ?? undefined),
      grade_or_status:
        params.grade_or_status === null
          ? undefined
          : (params.grade_or_status ?? existing.grade_or_status ?? undefined),
      recipient_email:
        params.recipient_email === null
          ? undefined
          : (params.recipient_email ?? existing.recipient_email ?? undefined),
      recipient_user_ids: params.recipient_user_ids ?? existing.recipient_user_ids ?? [],
    });

    const output = {
      id: certificate.id,
      certificate_code: certificate.certificate_code,
      message: 'Certificate updated.',
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Certificate Updated\n\n\`${certificate.certificate_code}\` (\`${certificate.id}\`)`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function deleteCertificateHandler(
  params: DeleteCertificateInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.write']);
    requireAdmin(ctx);
    const service = createAdminCertificatesService(ctx.supabase as never);

    await service.delete(params.id);
    const output = { id: params.id, message: 'Certificate deleted.' };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Certificate Deleted\n\n\`${params.id}\` was deleted.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function listCertificatesHandler(
  params: ListCertificatesInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.write']);
    requireAdmin(ctx);
    const service = createAdminCertificatesService(ctx.supabase as never);

    const { data, total } = await service.list(params.page, params.page_size, params.search ?? '');

    const items = data.map((c) => toPublicCertificate(c));
    const meta = {
      page: params.page,
      page_size: params.page_size,
      total,
      count: items.length,
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText({ certificates: items, meta }), {
        certificates: items,
        meta,
      });
    }

    const lines = [
      '# Certificates',
      '',
      `Found ${total} certificate${total === 1 ? '' : 's'}.`,
      '',
    ];
    for (const c of items) {
      lines.push(
        `- **${c.student_name}** — ${c.course_name} (\`${c.certificate_code}\`, issued ${formatDate(c.issue_date)})`
      );
    }
    return structuredResponse(lines.join('\n'), { certificates: items, meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function getCertificateHandler(
  params: GetCertificateInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['certificates.write']);
    requireAdmin(ctx);
    const service = createAdminCertificatesService(ctx.supabase as never);

    const certificate = await service.getById(params.id);
    if (!certificate) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No certificate found for id "${params.id}".` }],
      };
    }

    const output = toPublicCertificate(certificate);

    if (params.format === 'json') {
      return structuredResponse(jsonText(output), output);
    }

    const lines = [
      `# Certificate`,
      '',
      `- **Code**: ${output.certificate_code}`,
      `- **Student**: ${output.student_name}`,
      `- **Course**: ${output.course_name}`,
      `- **Issued**: ${formatDate(output.issue_date)}`,
      `- **Expires**: ${output.expiration_date ? formatDate(output.expiration_date) : 'Never'}`,
      output.grade_or_status ? `- **Grade/Status**: ${output.grade_or_status}` : null,
    ].filter((line): line is string => line !== null);

    return structuredResponse(lines.join('\n'), output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerCertificateWriteTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_create`,
    {
      title: 'Create Certificate',
      description: `Issues a new certificate. Admin only — requires the "certificates.write" scope and an ADMIN_EMAILS user.

Args:
  - student_name (string, required)
  - course_name (string, required)
  - issue_date (string, required, YYYY-MM-DD)
  - expiration_date (string|null, optional)
  - grade_or_status (string|null, optional)
  - recipient_email (string|null, optional)
  - recipient_user_ids (string[], optional)
  - custom_code (string, optional): COMP-YYYY-XXXXXXXX; auto-generated if omitted
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "certificate_code": string, "student_name": string, "course_name": string, "message": string }

Examples:
  - Use when: "issue a certificate to أحمد for برمجة الويب" -> student_name="أحمد", course_name="برمجة الويب", issue_date="2026-08-19"`,
      inputSchema: CreateCertificateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createCertificateHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_update`,
    {
      title: 'Update Certificate',
      description: `Updates an existing certificate. Admin only — requires the "certificates.write" scope and an ADMIN_EMAILS user.

Args:
  - id (string, required)
  - student_name / course_name / issue_date (optional)
  - expiration_date / grade_or_status / recipient_email (string|null, optional)
  - recipient_user_ids (string[], optional)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "certificate_code": string, "message": string }

Examples:
  - Use when: "update the student name of certificate c1" -> id="c1", student_name="مريم"`,
      inputSchema: UpdateCertificateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => updateCertificateHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_delete`,
    {
      title: 'Delete Certificate',
      description: `Deletes a certificate. Admin only — requires the "certificates.write" scope and an ADMIN_EMAILS user.

Args:
  - id (string, required)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "delete certificate c1" -> id="c1"`,
      inputSchema: DeleteCertificateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => deleteCertificateHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_list`,
    {
      title: 'List Certificates',
      description: `Lists all certificates with pagination and optional search. Admin only — requires the "certificates.write" scope and an ADMIN_EMAILS user.

Args:
  - page (number, default 1)
  - page_size (number, default 20, max 100)
  - search (string, optional): matches student, course, or code
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "certificates": PublicCertificate[], "meta": { "page": number, "page_size": number, "total": number, "count": number } }

Examples:
  - Use when: "list certificates" -> page=1, page_size=20
  - Use when: "search certificates for الويب" -> search="الويب"`,
      inputSchema: ListCertificatesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listCertificatesHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_certificates_get`,
    {
      title: 'Get Certificate',
      description: `Gets a single certificate by id with full details. Admin only — requires the "certificates.write" scope and an ADMIN_EMAILS user.

Args:
  - id (string, required)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): PublicCertificate

Examples:
  - Use when: "get certificate c1" -> id="c1"`,
      inputSchema: GetCertificateInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getCertificateHandler(params, ctx)
  );
}

export type {
  VerifyInput,
  ListMineInput,
  CreateCertificateInput,
  UpdateCertificateInput,
  DeleteCertificateInput,
  ListCertificatesInput,
  GetCertificateInput,
};
