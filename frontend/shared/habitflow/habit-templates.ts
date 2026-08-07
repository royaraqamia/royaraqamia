export interface HabitTemplate {
  name: string;
  icon: string;
  frequency: 'daily' | 'weekly';
  description: string;
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    name: 'شرب الماء',
    icon: 'Droplet',
    frequency: 'daily',
    description: '8 أكواب يوميًا',
  },
  {
    name: 'قراءة',
    icon: 'BookOpen',
    frequency: 'daily',
    description: '20 صفحة يوميًا',
  },
  {
    name: 'الرياضة',
    icon: 'Dumbbell',
    frequency: 'daily',
    description: '30 دقيقة تمرين',
  },
  {
    name: 'التأمل',
    icon: 'Brain',
    frequency: 'daily',
    description: '10 دقائق صفاء ذهني',
  },
  {
    name: 'أذكار الصباح',
    icon: 'Sun',
    frequency: 'daily',
    description: 'بداية يومك بالذكر',
  },
  {
    name: 'نوم مبكر',
    icon: 'Moon',
    frequency: 'daily',
    description: 'استيقظ بحيوية ونشاط',
  },
  {
    name: 'المشي',
    icon: 'Activity',
    frequency: 'daily',
    description: 'حركة يومية للجسم',
  },
  {
    name: 'المذاكرة',
    icon: 'Pen',
    frequency: 'weekly',
    description: 'جلسات مراجعة أسبوعية',
  },
];
