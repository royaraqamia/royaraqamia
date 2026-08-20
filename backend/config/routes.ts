export const PROTECTED_ROUTES: Record<string, string> = {
  '/linksnap/app': '/auth/login',
  '/blogpress/app': '/auth/login',
  '/blogpress/editor': '/auth/login',
  '/habitflow/app': '/auth/login',
  '/spendtrack/app': '/auth/login',
  '/admin': '/auth/login',
};

export const AUTH_ROUTES: Record<string, string> = {
  '/auth/login': '/',
  '/auth/signup': '/',
  '/auth/verify-otp': '/',
  '/auth/reset-password': '/',
};
