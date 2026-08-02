import {
  IAdminRepository,
  SystemStatsReportData,
} from '@/backend/repositories/linksnap/admin-repository';
import { AdminValidator } from '@/shared/admin-validator';

type SystemStatsReport = SystemStatsReportData;

export class GetSystemStatsService {
  constructor(private adminRepository: IAdminRepository) {}

  /**
   * Generates a global report of the entire URL shortener workspace.
   */
  async execute(userEmail: string): Promise<SystemStatsReport> {
    if (!AdminValidator.isAdmin(userEmail)) {
      throw new Error('Access Denied: Administrative privileges required.');
    }

    return await this.adminRepository.getSystemStats();
  }
}
