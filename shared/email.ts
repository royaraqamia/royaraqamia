/**
 * The one canonical form for an email address. Supabase Auth lowercases emails
 * when it stores them, so every app-side lookup (OTP records, password-reset
 * tokens, profile rows, rate-limit keys) must normalize the same way or it will
 * silently miss the row for `User@Example.com` vs `user@example.com`.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
