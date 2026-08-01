import type { Tables } from './database.types';

export type Certificate = Tables<'certificates'>;

export interface VerifyResult {
  success: boolean;
  certificate?: Certificate;
  error?: string;
  rateLimited?: boolean;
}
