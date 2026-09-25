import type { Retainer } from '@/shared/contracts/retainers';

export interface RetainerCreateInput {
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  company: string | null;
  current_projects: string;
  needs: string;
  preferred_start: string | null;
  reference_code: string;
  user_id: string | null;
}

/**
 * Only what the intake flow needs: a submission is written and never read back
 * by a client. The Admin list, the status transitions and the agreed terms
 * arrive with the Admin Console, and widen this interface then.
 *
 * `monthly_fee_usd` is deliberately absent: the table defaults it to the
 * advertised figure, and only the Admin records the terms actually agreed.
 */
export interface RetainersRepository {
  create(input: RetainerCreateInput): Promise<Retainer>;
}
