import { createServerAuthService } from '@/backend/config/auth';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type {
  LoginResult,
  OAuthResult,
  SignupResult,
  SimpleResult,
  UpdatePasswordResult,
  VerifyOtpResult,
} from '@/backend/services/auth/auth-service';

export async function login(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: LoginResult = await authService.login({
    email: (body.email ?? '') as string,
    password: (body.password ?? '') as string,
    redirectTo: (body.redirectTo ?? null) as string | null,
    turnstileToken: (body.turnstileToken ?? '') as string,
  });

  if ('needsOtp' in result) {
    return jsonResult(200, { needsOtp: true, redirectUrl: result.redirectUrl });
  }

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { redirectUrl: result.redirectUrl });
}

export async function signup(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: SignupResult = await authService.signup({
    name: (body.name ?? '') as string,
    email: (body.email ?? '') as string,
    password: (body.password ?? '') as string,
    redirectTo: (body.redirectTo ?? null) as string | null,
    turnstileToken: (body.turnstileToken ?? '') as string,
  });

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { redirectUrl: result.redirectUrl });
}

export async function verifyOtp(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: VerifyOtpResult = await authService.verifyOtp({
    email: (body.email ?? '') as string,
    otp: (body.otp ?? '') as string,
    redirectTo: (body.redirectTo ?? null) as string | null,
  });

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { success: true, redirectTo: result.redirectUrl });
}

export async function resendOtp(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: SimpleResult = await authService.resendOtp({
    email: (body.email ?? '') as string,
  });

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { message: result.message ?? '' });
}

export async function resetPassword(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: SimpleResult = await authService.resetPassword({
    email: (body.email ?? '') as string,
    redirectTo: (body.redirectTo ?? null) as string | null,
  });

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { message: result.message ?? '' });
}

export async function updatePassword(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: UpdatePasswordResult = await authService.updatePassword({
    password: (body.password ?? '') as string,
    confirmPassword: (body.confirmPassword ?? '') as string,
    token: (body.token ?? '') as string,
    email: (body.email ?? '') as string,
    redirectTo: (body.redirectTo ?? null) as string | null,
  });

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, {
    redirectUrl: result.redirectUrl,
  });
}

export async function signInWithGoogle(body: Record<string, unknown>): Promise<HttpResult> {
  const authService = await createServerAuthService();
  const result: OAuthResult = await authService.signInWithOAuth(
    'google',
    (body.redirectTo as string | undefined) ?? undefined
  );

  if (!result.ok) {
    return jsonResult(400, { error: result.message });
  }

  return jsonResult(200, { url: result.url });
}

export async function logout(): Promise<HttpResult> {
  try {
    const service = await createServerAuthService();
    await service.logout();
    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { error: 'فشل تسجيل الخروج' });
  }
}
