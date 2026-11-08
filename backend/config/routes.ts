export const PROTECTED_ROUTES: Record<string, string> = {
  '/admin': '/auth/login',
};

export const AUTH_ROUTES: Record<string, string> = {
  '/auth/login': '/',
  '/auth/signup': '/',
  '/auth/verify-otp': '/',
  '/auth/reset-password': '/',
};
