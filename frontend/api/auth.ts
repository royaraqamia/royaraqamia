'use server';

import { logout as signOut } from '@/backend/controllers/auth';

export async function logout() {
  await signOut();
}
