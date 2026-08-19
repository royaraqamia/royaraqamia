import type { AdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import type { EmailClient } from '@/backend/clients/email';

export interface EmailBroadcastInput {
  subject: string;
  body?: string;
}

/**
 * Admin email broadcaster. Resolves the recipient emails through the users
 * repository (the only code that knows the DB), drops users without a usable
 * email, then fans out to the email client in Resend-compatible batches.
 */
export class EmailBroadcastService {
  constructor(
    private readonly usersRepository: AdminUsersRepository,
    private readonly emailClient: EmailClient
  ) {}

  async broadcast(input: EmailBroadcastInput, userIds?: string[]): Promise<number> {
    const recipients = await this.usersRepository.findRecipientEmails(userIds);
    const emails = recipients
      .map((recipient) => recipient.email.trim())
      .filter((email) => email.length > 0);
    if (emails.length === 0) return 0;
    return this.emailClient.sendBroadcastEmails(
      emails.map((email) => ({ email, subject: input.subject, body: input.body }))
    );
  }
}
