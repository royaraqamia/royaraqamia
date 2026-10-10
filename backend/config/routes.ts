export const PROTECTED_ROUTES: Record<string, string> = {
  '/blogpress': '/auth/login',
  '/admin': '/auth/login',
};

export const AUTH_ROUTES: Record<string, string> = {
  '/auth/login': '/',
  '/auth/signup': '/',
  '/auth/verify-otp': '/',
  '/auth/reset-password': '/',
};
