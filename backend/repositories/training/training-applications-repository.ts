import type {
  TrainingApplication,
  TrainingApplicationStatus,
  TrainingExperienceLevel,
} from '@/shared/contracts/training';

export interface TrainingApplicationCreateInput {
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  experience_level: TrainingExperienceLevel;
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
  list(
    query: TrainingApplicationListQuery
  ): Promise<{ data: TrainingApplication[]; total: number }>;
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
