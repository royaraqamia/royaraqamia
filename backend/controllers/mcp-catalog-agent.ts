import { createHash, timingSafeEqual } from 'node:crypto';

import { createDefaultMcpCatalogAgentService } from '@/backend/config/mcp';
import { McpCatalogAgentError } from '@/backend/services/mcp/marketplace/catalog-agent';
import { McpCatalogError } from '@/backend/services/mcp/marketplace/catalog-service';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { McpCatalogAgentRequestSchema } from '@/shared/contracts/mcp-catalog-agent';

/**
 * The catalogue agent's single door (#1293).
 *
 * One bearer token, `MCP_CATALOG_AGENT_TOKEN`, and a verb allowlist that *is*
 * the capability: `list`, `mark`, `copy`, `verify`, `withdraw`, `skip`. There is
 * no block, no delete, no remote change and no member data, because there is no
 * branch that reaches one — the service behind this controller has no method
 * for it either.
 *
 * A missing token refuses every request. The run that cannot find one then fails
 * loudly instead of reporting success over zero work.
 */

const UNAUTHORIZED = { success: false, error: 'unauthorized' } as const;

function bearerMatches(headers: Headers): boolean {
  const expected = process.env.MCP_CATALOG_AGENT_TOKEN?.trim();
  if (!expected) return false;

  const supplied = /^Bearer\s+(.+)$/i.exec(headers.get('authorization') ?? '')?.[1] ?? '';
  // Hashed first so the comparison is over two fixed-length buffers: an exact
  // `timingSafeEqual` would throw on a different length and leak it.
  const received = createHash('sha256').update(supplied).digest();
  const wanted = createHash('sha256').update(expected).digest();
  return timingSafeEqual(received, wanted);
}

export async function runMcpCatalogAgent(headers: Headers, body: string): Promise<HttpResult> {
  if (!bearerMatches(headers)) {
    return jsonResult(401, UNAUTHORIZED, { headers: NO_STORE });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonResult(400, { success: false, error: 'invalid_body' }, { headers: NO_STORE });
  }

  const parsed = McpCatalogAgentRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResult(
      400,
      {
        success: false,
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'invalid request',
      },
      { headers: NO_STORE }
    );
  }

  const service = createDefaultMcpCatalogAgentService();

  try {
    if (parsed.data.action === 'list') {
      const page = await service.candidates(parsed.data.limit);
      return jsonResult(
        200,
        { success: true, data: { candidates: page.candidates, coverage: page.coverage } },
        { headers: NO_STORE }
      );
    }

    await service.act(parsed.data);
    return jsonResult(200, { success: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof McpCatalogAgentError) {
      return jsonResult(
        400,
        { success: false, error: error.failure, message: error.message },
        { headers: NO_STORE }
      );
    }
    // The catalogue's own refusal (an invalid mark, a row that is not
    // connectable) is the agent's answer too, not a server fault.
    if (error instanceof McpCatalogError) {
      return jsonResult(
        400,
        { success: false, error: error.failure, message: error.message },
        { headers: NO_STORE }
      );
    }
    throw error;
  }
}
