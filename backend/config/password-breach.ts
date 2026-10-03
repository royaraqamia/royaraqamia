import {
  createPasswordBreachChecker,
  type PasswordBreachChecker,
} from '@/backend/clients/password-breach';
import { env } from '@/backend/config/env';

let defaultChecker: PasswordBreachChecker | null = null;

export function getPasswordBreachChecker(): PasswordBreachChecker {
  if (!defaultChecker) {
    defaultChecker = createPasswordBreachChecker({ enabled: env.passwordBreachCheckEnabled });
  }
  return defaultChecker;
}
