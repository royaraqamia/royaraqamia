import { RetainerRequestForm } from '@/frontend/ui/retainers/retainer-request-form';

export default function HirePage() {
  return (
    <div className="space-y-8">
      <section
        aria-label="نموذج التَّوظيف الشَّهري"
        className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm"
      >
        <RetainerRequestForm />
      </section>
    </div>
  );
}
