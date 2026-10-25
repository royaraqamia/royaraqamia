'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, RefreshCw } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate } from '@/frontend/shared/format';
import { useSession } from '@/frontend/state/session-provider';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import {
  halveList,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { ApiError } from '@/frontend/transport/http';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
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

/** The surface's snapshot (#495): the four lists the view turned into rows. */
const ACCOUNT_SUBMISSIONS_ROUTE = '/account/submissions';

interface SubmissionsSnapshot {
  projectRequests: ProjectRequest[];
  retainers: Retainer[];
  applications: TrainingApplication[];
  bookings: ConsultationBooking[];
}

/** The byte budget's second pass over each list. */
function trimSubmissions(data: SubmissionsSnapshot): SubmissionsSnapshot | null {
  const next: SubmissionsSnapshot = {
    projectRequests: halveList(data.projectRequests),
    retainers: halveList(data.retainers),
    applications: halveList(data.applications),
    bookings: halveList(data.bookings),
  };

  const empty = Object.values(next).every((rows) => rows.length === 0);
  return empty ? null : next;
}

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

function SubmissionsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
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

/**
 * The signed-in visitor's own submissions across the intake flows. Only rows
 * submitted while signed in appear here — an anonymous submission has no
 * account to prove ownership against, so it cannot be edited.
 *
 * The guard moved client-side (#448): the page is a data-free shell the worker
 * may cache, and this view reads the session itself — network failure is never
 * a logout, so a cached shell stays signed in — and reads the four lists
 * through the never-cache `/api` prefixes. A guest is pointed at sign-in in
 * place, and a read that never reached the server renders the shared
 * needs-connection state instead of the forever-skeleton an uncaught rejection
 * used to leave behind.
 *
 * The edit forms and the save handlers stay per-kind, so a project request and
 * a retainer never share a mutable shape; only the list chrome is common.
 */
export function MySubmissionsView() {
  const { user, isLoading } = useSession();
  const { identity } = useLocalIdentity();
  const [projectRequests, setProjectRequests] = useState<ProjectRequest[] | null>(null);
  const [retainers, setRetainers] = useState<Retainer[] | null>(null);
  const [applications, setApplications] = useState<TrainingApplication[] | null>(null);
  const [bookings, setBookings] = useState<ConsultationBooking[] | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadOffline, setLoadOffline] = useState(false);

  // The last screen this identity's submissions painted (#495): the lists are
  // network reads, so the snapshot is what stops the first frame being a
  // skeleton for a visitor who just looked at them.
  const snapshot = useSnapshot<SubmissionsSnapshot>(identity, ACCOUNT_SUBMISSIONS_ROUTE);
  const loaded = useMemo(() => {
    if (!projectRequests || !retainers || !applications || !bookings) return null;
    return {
      projectRequests: screenful(projectRequests),
      retainers: screenful(retainers),
      applications: screenful(applications),
      bookings: screenful(bookings),
    };
  }, [projectRequests, retainers, applications, bookings]);
  useSnapshotRecorder(identity, ACCOUNT_SUBMISSIONS_ROUTE, loaded, {
    trim: trimSubmissions,
  });

  // What the lists paint with: the response once it lands, the last screen before.
  const requests = projectRequests ?? snapshot?.projectRequests ?? null;
  const retainerRows = retainers ?? snapshot?.retainers ?? null;
  const applicationRows = applications ?? snapshot?.applications ?? null;
  const bookingRows = bookings ?? snapshot?.bookings ?? null;

  const load = useCallback(async () => {
    setLoadFailed(false);
    setLoadOffline(false);
    try {
      const [requests, rows, training, consultations] = await Promise.all([
        getMyProjectRequests(),
        getMyRetainers(),
        getMyTrainingApplications(),
        getMyConsultationBookings(),
      ]);
      setProjectRequests(requests);
      setRetainers(rows);
      setApplications(training);
      setBookings(consultations);
    } catch (error) {
      setLoadOffline(error instanceof ApiError && error.isNetworkError);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;
    void load();
  }, [isLoading, user, load]);

  // A failed load with a snapshot on screen keeps the last rows: the error state
  // is for "nothing to show", not for "the newest read failed" (#495).
  if (loadFailed && !snapshot) {
    if (loadOffline) {
      return (
        <NeedsConnection
          message="تعذّر تحميل طلباتك: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
          onRetry={() => void load()}
        />
      );
    }

    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-bold text-destructive sm:text-base">تعذّر تحميل طلباتك.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  if (isLoading && !snapshot) return <SubmissionsSkeleton label="جاري تحميل طلباتك" />;

  if (!user) return <SignInCta href="/auth/login?redirect=/account/submissions" />;

  if (
    requests === null ||
    retainerRows === null ||
    applicationRows === null ||
    bookingRows === null
  ) {
    return <SubmissionsSkeleton label="جاري تحميل طلباتك" />;
  }

  const submissions = toSubmissions(requests, retainerRows, applicationRows, bookingRows);

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
                    request={requests.find((row) => row.id === submission.id)!}
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
                    retainer={retainerRows.find((row) => row.id === submission.id)!}
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
                    application={applicationRows.find((row) => row.id === submission.id)!}
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
                    booking={bookingRows.find((row) => row.id === submission.id)!}
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
