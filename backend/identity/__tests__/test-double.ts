import type { AuthUser } from '../index';

/**
 * One test double for the identity seam, so controller tests declare only the
 * outcome they need instead of repeating the module shape. This is not a test
 * file; vitest does not collect it.
 *
 * The shapes are deliberately loose (`client: unknown`): the double stands in
 * for the mocked module, where the concrete Supabase client type is irrelevant.
 */
export interface IdentityDoubleOptions {
  session: () => Promise<{ user: AuthUser | null; client: unknown }>;
  optional?: () => Promise<{ user: AuthUser | null; client: unknown }>;
  bearer?: (authorization: string | null) => Promise<AuthUser | null>;
  admin?: () => Promise<
    | { kind: 'anonymous' }
    | { kind: 'forbidden' }
    | { kind: 'admin'; identity: { user: AuthUser; client: unknown } }
  >;
}

export function identityDouble(options: IdentityDoubleOptions) {
  return {
    identity: {
      resolveSession: () => options.session(),
      resolveOptional: () => (options.optional ?? defaultOptional)(),
      resolveBearer: options.bearer ?? (async () => null),
      resolveAdmin: options.admin ?? (async () => ({ kind: 'anonymous' as const })),
    },
  };
}

async function defaultOptional() {
  return { user: null, client: null };
}
