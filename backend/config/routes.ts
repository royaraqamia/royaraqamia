export const PROTECTED_ROUTES: Record<string, string> = {
  '/linksnap': '/auth/login',
  '/blogpress': '/auth/login',
  '/habitflow': '/auth/login',
  '/spendtrack': '/auth/login',
  '/admin': '/auth/login',
};

export const AUTH_ROUTES: Record<string, string> = {
  '/auth/login': '/',
  '/auth/signup': '/',
  '/auth/verify-otp': '/',
  '/auth/reset-password': '/',
};
