import {
  IAdminRepository,
  SystemStatsReportData,
} from '@/backend/repositories/linksnap/admin-repository';
import { isAdmin } from '@/shared/admin-validator';

type SystemStatsReport = SystemStatsReportData;

export class GetSystemStatsService {
  constructor(
    private adminRepository: IAdminRepository,
    private readonly adminEmails: string[]
  ) {}

  /**
   * Generates a global report of the entire URL shortener workspace.
   */
  async execute(userEmail: string): Promise<SystemStatsReport> {
    if (!isAdmin(userEmail, this.adminEmails)) {
      throw new Error('Access Denied: Administrative privileges required.');
    }

    return await this.adminRepository.getSystemStats();
  }
}
