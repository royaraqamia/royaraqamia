export function parseAdminEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string, adminEmails: string[]): boolean {
  if (!email) return false;
  if (adminEmails.length === 0) return false;
  const normalized = adminEmails.map((e) => e.trim().toLowerCase());
  return normalized.includes(email.trim().toLowerCase());
}

/**
 * Order-insensitive comparison of two allowlists, used to decide whether the database
 * copy needs rewriting. Mirrors the comparison the repository has always used.
 */
export function isSameAllowlist(current: string[], next: string[]): boolean {
  return current.length === next.length && current.every((email) => next.includes(email));
}
