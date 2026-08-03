export function parseAdminEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export class AdminValidator {
  static isAdmin(email: string, adminEmails: string[]): boolean {
    if (!email) return false;
    if (adminEmails.length === 0) return false;
    const normalized = adminEmails.map((e) => e.trim().toLowerCase());
    return normalized.includes(email.trim().toLowerCase());
  }
}
