import {
  IAdminRepository,
  SystemStatsReportData,
} from '../../domain/interfaces/admin-repository.interface';
import { AdminValidator } from '../../domain/services/admin-validator';

export type SystemStatsReport = SystemStatsReportData;

export class GetSystemStatsUseCase {
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
