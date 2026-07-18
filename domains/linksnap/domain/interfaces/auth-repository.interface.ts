export interface AuthRepository {
  confirmUserEmail(email: string): Promise<{ userId: string; email: string }>;
}
