import { isAdmin } from '@/backend/shared/admin-validator';
import { env } from '@/backend/config/env';

/**
 * MCP scope definitions. Granular read/write per product + admin.
 * Admin scope is only granted to users whose email is in ADMIN_EMAILS
 * at the moment they complete the consent flow.
 */

export type McpScope =
  | 'blog.read'
  | 'blog.write'
  | 'linksnap.read'
  | 'linksnap.write'
  | 'spendtrack.read'
  | 'spendtrack.write'
  | 'habitflow.read'
  | 'habitflow.write'
  | 'certificates.read'
  | 'certificates.write'
  | 'profile.read'
  | 'profile.write'
  | 'admin';

export const ALL_SCOPES: McpScope[] = [
  'blog.read',
  'blog.write',
  'linksnap.read',
  'linksnap.write',
  'spendtrack.read',
  'spendtrack.write',
  'habitflow.read',
  'habitflow.write',
  'certificates.read',
  'certificates.write',
  'profile.read',
  'profile.write',
  'admin',
];

export const SCOPE_LABELS: Record<McpScope, string> = {
  'blog.read': 'Read your blog posts and categories',
  'blog.write': 'Create, edit, and delete your blog posts',
  'linksnap.read': 'View your short links and analytics',
  'linksnap.write': 'Create and manage your short links',
  'spendtrack.read': 'View your budgets, expenses, and categories',
  'spendtrack.write': 'Manage your budgets, expenses, and categories',
  'habitflow.read': 'View your habits and logs',
  'habitflow.write': 'Create and update your habits and logs',
  'certificates.read': 'Verify certificates and view your own',
  'certificates.write': 'Issue and manage certificates (admin only)',
  'profile.read': 'View your profile information',
  'profile.write': 'Update your profile',
  admin: 'Full administrative access to all data',
};

export const SCOPE_PRODUCT_GROUPS: Record<string, McpScope[]> = {
  Blog: ['blog.read', 'blog.write'],
  LinkSnap: ['linksnap.read', 'linksnap.write'],
  SpendTrack: ['spendtrack.read', 'spendtrack.write'],
  HabitFlow: ['habitflow.read', 'habitflow.write'],
  Certificates: ['certificates.read', 'certificates.write'],
  Profile: ['profile.read', 'profile.write'],
  Administration: ['admin'],
};

export function scopesToLabels(scopes: McpScope[]): string[] {
  return scopes.map((s) => SCOPE_LABELS[s] ?? s);
}

/**
 * Determine if the given email should be granted the admin scope.
 * Checked at token-issuance time (consent page).
 */
export function shouldGrantAdminScope(email: string): boolean {
  return isAdmin(email, env.adminEmails);
}

/**
 * Scope sets for the three access tiers.
 */
export const TIER_SCOPES = {
  anonymous: [] as McpScope[],
  authenticated: [
    'blog.read',
    'linksnap.read',
    'linksnap.write',
    'spendtrack.read',
    'spendtrack.write',
    'habitflow.read',
    'habitflow.write',
    'certificates.read',
    'profile.read',
    'profile.write',
  ] as McpScope[],
  admin: [
    'blog.read',
    'blog.write',
    'linksnap.read',
    'linksnap.write',
    'spendtrack.read',
    'spendtrack.write',
    'habitflow.read',
    'habitflow.write',
    'certificates.read',
    'certificates.write',
    'profile.read',
    'profile.write',
    'admin',
  ] as McpScope[],
};

/**
 * Check if a scope set grants at least one of the required scopes.
 */
export function hasAnyScope(scopes: McpScope[], required: McpScope[]): boolean {
  return required.some((r) => scopes.includes(r));
}

/**
 * Public read tools (available without authentication).
 */
export const PUBLIC_TOOL_SCOPES: McpScope[] = [
  'blog.read',
  'certificates.read', // verify_certificate
];

export function isPublicToolScope(scope: McpScope): boolean {
  return PUBLIC_TOOL_SCOPES.includes(scope);
}

/**
 * Parse a space-delimited `scope` query/form value into known scopes.
 * Unknown scopes are silently dropped.
 */
export function parseScopes(raw: string | null | undefined): McpScope[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(/\s+/).filter((s): s is McpScope => ALL_SCOPES.includes(s as McpScope));
}

/**
 * Compute the effective scope set to grant at consent time.
 * Admin scope is only granted to users whose email is in ADMIN_EMAILS, and
 * only when the client explicitly requested it.
 */
export function effectiveScopes(email: string | null, requested: McpScope[]): McpScope[] {
  const known = requested.filter((s) => ALL_SCOPES.includes(s));
  const isAdminUser = email !== null && shouldGrantAdminScope(email);
  return known.filter((s) => s !== 'admin' || isAdminUser);
}
