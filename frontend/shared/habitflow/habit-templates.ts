export interface HabitTemplate {
  name: string;
  frequency: 'daily' | 'weekly';
  description: string;
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    name: 'شرب الماء',
    frequency: 'daily',
    description: '8 أكواب يوميًا',
  },
  {
    name: 'قراءة',
    frequency: 'daily',
    description: '20 صفحة يوميًا',
  },
  {
    name: 'الرياضة',
    frequency: 'daily',
    description: '30 دقيقة تمرين',
  },
  {
    name: 'التأمل',
    frequency: 'daily',
    description: '10 دقائق صفاء ذهني',
  },
  {
    name: 'أذكار الصباح',
    frequency: 'daily',
    description: 'بداية يومك بالذكر',
  },
  {
    name: 'نوم مبكر',
    frequency: 'daily',
    description: 'استيقظ بحيوية ونشاط',
  },
  {
    name: 'المشي',
    frequency: 'daily',
    description: 'حركة يومية للجسم',
  },
  {
    name: 'المذاكرة',
    frequency: 'weekly',
    description: 'جلسات مراجعة أسبوعية',
  },
];
