import { APP_BASE_URL } from '@/frontend/shared/constants';

export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return APP_BASE_URL;
}
