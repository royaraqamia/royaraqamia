export class AdminValidator {
  static isAdmin(email: string): boolean {
    if (!email) return false;
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (adminEmails.length === 0) return false;
    return adminEmails.includes(email.trim().toLowerCase());
  }
}
