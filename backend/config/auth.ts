import { AuthService, type AuthServiceDeps } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';

export function createAuthService(gateway: AuthGateway, deps: AuthServiceDeps = {}): AuthService {
  return new AuthService(gateway, deps);
}
