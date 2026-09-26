import { ProjectRequestForm } from '@/frontend/ui/project-requests/project-request-form';

export default function RequestProjectPage() {
  return (
    <div className="space-y-8">
      <section
        aria-label="نموذج طلب المشروع"
        className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm"
      >
        <ProjectRequestForm />
      </section>
    </div>
  );
}
