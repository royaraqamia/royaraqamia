export function isAdmin(email: string, adminEmails: string[]): boolean {
  if (!email) return false;
  if (adminEmails.length === 0) return false;
  const normalized = adminEmails.map((e) => e.trim().toLowerCase());
  return normalized.includes(email.trim().toLowerCase());
}
