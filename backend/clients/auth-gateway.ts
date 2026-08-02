export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  email_confirmed_at?: string | null;
}

export interface AuthGateway {
  signUp(input: { email: string; password: string; name: string }): Promise<{
    user: { id: string } | null;
    error: { message: string } | null;
  }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{
    user: AuthUser | null;
    error: { message: string } | null;
  }>;
  getUser(): Promise<{ user: AuthUser | null }>;
  updateUser(input: { password: string }): Promise<{ error: { message: string } | null }>;
  signOut(): Promise<void>;
  signInWithOAuth(
    provider: 'google',
    redirectTo: string
  ): Promise<{ url: string | null; error: { message: string } | null }>;
  resetPasswordForEmail(
    email: string,
    redirectTo: string
  ): Promise<{ error: { message: string } | null }>;
  confirmUserEmail(userId: string): Promise<void>;
  listUsers(): Promise<{ users: AuthUser[]; error: { message: string } | null }>;
  upsertUserProfile(input: { id: string; email: string; name: string }): Promise<void>;
}
