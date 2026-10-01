'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Pencil } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate } from '@/frontend/shared/format';
import { getMyProjectRequests } from '@/frontend/api/project-requests';
import { getMyRetainers } from '@/frontend/api/retainers';
import { getMyTrainingApplications } from '@/frontend/api/training';
import { getMyConsultationBookings } from '@/frontend/api/consultation';
import {
  PROJECT_REQUEST_STATUS_LABELS,
  PROJECT_REQUEST_TYPE_LABELS,
  type ProjectRequest,
} from '@/shared/contracts/project-requests';
import { RETAINER_STATUS_LABELS, type Retainer } from '@/shared/contracts/retainers';
import {
  TRAINING_APPLICATION_STATUS_LABELS,
  TRAINING_COURSE,
  type TrainingApplication,
} from '@/shared/contracts/training';
import {
  CONSULTATION_BOOKING_STATUS_LABELS,
  type ConsultationBooking,
} from '@/shared/contracts/consultation';
import { ProjectRequestEditForm } from './project-request-edit-form';
import { RetainerEditForm } from './retainer-edit-form';
import { TrainingApplicationEditForm } from './training-application-edit-form';
import { ConsultationBookingEditForm } from './consultation-booking-edit-form';

type Kind = 'project_request' | 'retainer' | 'training_application' | 'consultation_booking';

interface Submission {
  id: string;
  kind: Kind;
  referenceCode: string;
  title: string;
  statusLabel: string;
  summary: string;
  createdAt: string;
  editedAt: string | null;
}

const KIND_LABELS: Record<Kind, string> = {
  project_request: 'طلب مشروع',
  retainer: 'تعاقُد شهري',
  training_application: 'التحاق بالتَّدريب',
  consultation_booking: 'حجز استشارة',
};

function toSubmissions(
  requests: ProjectRequest[],
  retainers: Retainer[],
  applications: TrainingApplication[],
  bookings: ConsultationBooking[]
): Submission[] {
  const fromRequests: Submission[] = requests.map((request) => ({
    id: request.id,
    kind: 'project_request',
    referenceCode: request.reference_code,
    title: PROJECT_REQUEST_TYPE_LABELS[request.project_type],
    statusLabel: PROJECT_REQUEST_STATUS_LABELS[request.status],
    summary: request.description,
    createdAt: request.created_at,
    editedAt: request.edited_at,
  }));

  const fromRetainers: Submission[] = retainers.map((retainer) => ({
    id: retainer.id,
    kind: 'retainer',
    referenceCode: retainer.reference_code,
    title: retainer.company ?? 'تعاقُد شهري',
    statusLabel: RETAINER_STATUS_LABELS[retainer.status],
    summary: retainer.needs,
    createdAt: retainer.created_at,
    editedAt: retainer.edited_at,
  }));

  const fromApplications: Submission[] = applications.map((application) => ({
    id: application.id,
    kind: 'training_application',
    referenceCode: application.reference_code,
    title: TRAINING_COURSE.title,
    statusLabel: TRAINING_APPLICATION_STATUS_LABELS[application.status],
    summary: application.goal ?? '',
    createdAt: application.created_at,
    editedAt: application.edited_at,
  }));

  const fromBookings: Submission[] = bookings.map((booking) => ({
    id: booking.id,
    kind: 'consultation_booking',
    referenceCode: booking.reference_code,
    title: booking.package_name ?? 'استشارة',
    statusLabel: CONSULTATION_BOOKING_STATUS_LABELS[booking.status],
    summary: booking.topic_description,
    createdAt: booking.created_at,
    editedAt: booking.edited_at,
  }));

  return [...fromRequests, ...fromRetainers, ...fromApplications, ...fromBookings].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * The signed-in visitor's own submissions across the intake flows. Only rows
 * submitted while signed in appear here — an anonymous submission has no
 * account to prove ownership against, so it cannot be edited.
 *
 * The edit forms and the save handlers stay per-kind, so a project request and
 * a retainer never share a mutable shape; only the list chrome is common.
 */
export function MySubmissionsView() {
  const [projectRequests, setProjectRequests] = useState<ProjectRequest[] | null>(null);
  const [retainers, setRetainers] = useState<Retainer[] | null>(null);
  const [applications, setApplications] = useState<TrainingApplication[] | null>(null);
  const [bookings, setBookings] = useState<ConsultationBooking[] | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getMyProjectRequests(),
      getMyRetainers(),
      getMyTrainingApplications(),
      getMyConsultationBookings(),
    ]).then(([requests, rows, training, consultations]) => {
      if (!active) return;
      setProjectRequests(requests);
      setRetainers(rows);
      setApplications(training);
      setBookings(consultations);
    });
    return () => {
      active = false;
    };
  }, []);

  if (
    projectRequests === null ||
    retainers === null ||
    applications === null ||
    bookings === null
  ) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="جاري تحميل طلباتك">
        {[0, 1].map((key) => (
          <div key={key} className="rounded-2xl border border-border/60 bg-card p-5">
            <Skeleton className="mb-3 h-5 w-48" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  const submissions = toSubmissions(projectRequests, retainers, applications, bookings);

  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="لا توجد طلبات بعد"
        description="عندما ترسل طلبًا وأنت مسجَّل الدُّخول، سيظهر هنا ويمكنك تعديله في أيِّ وقت."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {submissions.map((submission) => {
        const key = `${submission.kind}:${submission.id}`;
        const isEditing = editingKey === key;

        return (
          <li
            key={key}
            className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {KIND_LABELS[submission.kind]}
                  </span>
                  <h2 className="text-base font-bold text-foreground">{submission.title}</h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <code
                    dir="ltr"
                    className="block font-mono text-xs tracking-tight text-muted-foreground"
                  >
                    {submission.referenceCode}
                  </code>
                  <span className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {submission.statusLabel}
                  </span>
                </div>
              </div>

              {!isEditing && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingKey(key)}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  تعديل
                </Button>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-foreground/90">{submission.summary}</p>

            <p className="mt-3 text-xs text-muted-foreground">
              {submission.editedAt
                ? `آخر تعديل: ${formatHijriDate(submission.editedAt)}`
                : `أُرسل في: ${formatHijriDate(submission.createdAt)}`}
            </p>

            {isEditing && (
              <div className="mt-5 border-t border-border/50 pt-5">
                {submission.kind === 'project_request' && (
                  <ProjectRequestEditForm
                    request={projectRequests.find((row) => row.id === submission.id)!}
                    onSaved={(updated) => {
                      setProjectRequests(
                        (rows) =>
                          rows?.map((row) => (row.id === updated.id ? updated : row)) ?? rows
                      );
                      setEditingKey(null);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                )}
                {submission.kind === 'retainer' && (
                  <RetainerEditForm
                    retainer={retainers.find((row) => row.id === submission.id)!}
                    onSaved={(updated) => {
                      setRetainers(
                        (rows) =>
                          rows?.map((row) => (row.id === updated.id ? updated : row)) ?? rows
                      );
                      setEditingKey(null);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                )}
                {submission.kind === 'training_application' && (
                  <TrainingApplicationEditForm
                    application={applications.find((row) => row.id === submission.id)!}
                    onSaved={(updated) => {
                      setApplications(
                        (rows) =>
                          rows?.map((row) => (row.id === updated.id ? updated : row)) ?? rows
                      );
                      setEditingKey(null);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                )}
                {submission.kind === 'consultation_booking' && (
                  <ConsultationBookingEditForm
                    booking={bookings.find((row) => row.id === submission.id)!}
                    onSaved={(updated) => {
                      setBookings(
                        (rows) =>
                          rows?.map((row) => (row.id === updated.id ? updated : row)) ?? rows
                      );
                      setEditingKey(null);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
