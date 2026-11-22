import { NextRequest } from 'next/server';

import { getMcpCatalogRemoteOptions } from '@/backend/controllers/mcp-catalog';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * The addresses in the registry's own document, for the Admin Console's remote
 * picker (issue #1671). A separate request, made only when the picker opens:
 * the list itself must not carry an 882-byte blob for every row it draws.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await getMcpCatalogRemoteOptions({ registryName: searchParams.get('registryName') })
  );
}
