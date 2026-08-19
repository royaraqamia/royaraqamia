import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
import { toPublicCertificate } from '@/shared/contracts/certificates';
import { formatDate } from './shared';

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

export type { VerifyInput, ListMineInput };
