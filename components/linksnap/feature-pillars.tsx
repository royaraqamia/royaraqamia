import { Link2, BarChart3, ShieldCheck } from 'lucide-react';

export function FeaturePillars() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
      <FeatureCard
        icon={<Link2 aria-hidden="true" className="w-5 h-5 text-indigo-600 shrink-0" />}
        title="سرعة البرق"
        description="وقت إعادة توجيه أقل من 100 ملي ثانية."
      />
      <FeatureCard
        icon={<BarChart3 aria-hidden="true" className="w-5 h-5 text-indigo-600 shrink-0" />}
        title="تحليلات حقيقية"
        description="سجل نقرات ومصادر تفاعلية."
      />
      <FeatureCard
        icon={<ShieldCheck aria-hidden="true" className="w-5 h-5 text-indigo-600 shrink-0" />}
        title="آمن ومأمون"
        description="قوائم حظر متقدمة للبريد المزعج والإساءة."
      />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-100 dark:border-slate-700 flex gap-3 transition-all duration-200 hover:border-indigo-100 dark:hover:border-indigo-800 hover:shadow-lg hover:shadow-indigo-100/20 dark:hover:shadow-indigo-900/20 hover:-translate-y-0.5">
      {icon}
      <div className="space-y-0.5">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-500">{description}</p>
      </div>
    </div>
  );
}
