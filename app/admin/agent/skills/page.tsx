import type { Metadata } from 'next';

import { AgentSkillTelemetryView } from '@/frontend/ui/admin/agent-skills/agent-skill-telemetry-view';

export const metadata: Metadata = {
  title: 'المتخصصون',
  description: 'أعداد المتخصصين التي عرضتها قائمة الاقتراحات وكيف انتهت الأجوبة التي حملتها.',
};

export default function AdminAgentSkillsPage() {
  return <AgentSkillTelemetryView />;
}
