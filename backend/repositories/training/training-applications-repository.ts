import type { TrainingApplication, TrainingApplicationStatus } from '@/shared/contracts/training';
import type { Paginated } from '@/shared/pagination';

export interface TrainingApplicationCreateInput {
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  goal: string | null;
  reference_code: string;
  user_id: string | null;
}

export interface TrainingApplicationListQuery {
  page: number;
  pageSize: number;
  status?: TrainingApplicationStatus;
  search?: string;
}

export interface TrainingApplicationsReader {
  getById(id: string): Promise<TrainingApplication | null>;
  getByReferenceCode(referenceCode: string): Promise<TrainingApplication | null>;
  list(query: TrainingApplicationListQuery): Promise<Paginated<TrainingApplication>>;
}

export interface TrainingApplicationsWriter {
  create(input: TrainingApplicationCreateInput): Promise<TrainingApplication>;
  updateStatus(
    id: string,
    status: TrainingApplicationStatus,
    notes: string | null
  ): Promise<TrainingApplication>;
}

export interface TrainingApplicationsRepository
  extends TrainingApplicationsReader, TrainingApplicationsWriter {}
