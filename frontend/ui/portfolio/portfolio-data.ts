const PORTFOLIO_IMAGE_COUNT = 25;
const IMAGE_FILENAME_PADDING = 2;

export const PORTFOLIO_IMAGES = Array.from({ length: PORTFOLIO_IMAGE_COUNT }, (_, i) => {
  const num = (i + 1).toString().padStart(IMAGE_FILENAME_PADDING, '0');
  return { webp: `/${num}.webp` };
});

export const CARD_COUNT = 13;

const removedIndices = new Set([4, 7, 11, 19, 16, 8, 22, 17, 21, 23, 9, 15]);

export const projectImages: Record<number, { webp: string }[]> = {
  0: [PORTFOLIO_IMAGES[0]!, PORTFOLIO_IMAGES[4]!],
  1: [PORTFOLIO_IMAGES[1]!, PORTFOLIO_IMAGES[7]!],
  2: [PORTFOLIO_IMAGES[2]!, PORTFOLIO_IMAGES[11]!],
  3: [PORTFOLIO_IMAGES[3]!, PORTFOLIO_IMAGES[9]!, PORTFOLIO_IMAGES[15]!],
  5: [PORTFOLIO_IMAGES[5]!, PORTFOLIO_IMAGES[8]!, PORTFOLIO_IMAGES[22]!],
  10: [PORTFOLIO_IMAGES[10]!, PORTFOLIO_IMAGES[16]!],
  13: [PORTFOLIO_IMAGES[13]!, PORTFOLIO_IMAGES[19]!],
  14: [PORTFOLIO_IMAGES[14]!, PORTFOLIO_IMAGES[17]!, PORTFOLIO_IMAGES[21]!, PORTFOLIO_IMAGES[23]!],
};

export const visibleIndices = Array.from({ length: PORTFOLIO_IMAGE_COUNT }, (_, i) => i).filter(
  (i) => !removedIndices.has(i)
);

export interface ProjectData {
  title: string;
  category?: string;
  description?: string;
  metrics?: string[];
}

export const projectData: ProjectData[] = [
  {
    title: 'موقع عيادة أسنان',
  },
  {
    title: 'تطبيق عطور',
  },
  {
    title: 'متجر إلكتروني',
  },
  {
    title: 'موقع هدايا',
  },
  {
    title: 'موقع عيادة أسنان',
  },
  {
    title: 'تطبيق إلكترونيَّات وكهربائيَّات',
  },
  {
    title: 'موقع تحليل بيانات',
  },
  {
    title: 'تطبيق عطور',
  },
  {
    title: 'تطبيق إلكترونيَّات وكهربائيَّات',
  },
  {
    title: 'Dashboard لمتجر إلكتروني',
  },
  {
    title: 'تطبيق سيَّارات',
  },
  {
    title: 'واجهة المحادثة لمتجر إلكتروني',
  },
  {
    title: 'لوحة تصميم إشعارات',
  },
  {
    title: 'تطبيق سفريَّات',
  },
  {
    title: 'تطبيق استشارات قانونيَّة',
  },
  {
    title: 'هوية علامة مياه',
  },
  {
    title: 'حجز إلكتروني للسيارات',
  },
  {
    title: 'منصة لوجستية',
  },
  {
    title: 'لوحة إدارة أسعار',
  },
  {
    title: 'هوية مؤسسة خيرية',
  },
  {
    title: 'تطبيق إعلانات',
  },
  {
    title: 'منصة تحليلات',
  },
  {
    title: 'نادي رياضي',
  },
  {
    title: 'تطبيق إعلانات',
  },
  {
    title: 'تطبيق عقارات',
  },
];

export const headerVariant = {
  hidden: { opacity: 0, y: -40 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 70, damping: 20 } },
} as const;

export const cardStagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

export const cardVariant = {
  hidden: { opacity: 0, scale: 0.9, x: 50 },
  show: { opacity: 1, scale: 1, x: 0, transition: { type: 'spring', stiffness: 80, damping: 20 } },
} as const;
