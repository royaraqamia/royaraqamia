# رؤية رقمية (Roya Raqamia)

> شريكك الاستراتيجي للتَّحوُّل الرَّقمي ومضاعفة نجاحك

نبني مواقع إلكترونيَّة وتطبيقات بكود نظيف، قابل للصِّيانة والتَّوسُّع؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.

## التقنيات (Tech Stack)

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v3 + CSS Custom Properties
- **UI Library:** Radix UI primitives + shadcn/ui components
- **Animations:** Framer Motion
- **Icons:** Phosphor Icons + Lucide React
- **Fonts:** IBM Plex Sans Arabic, Aref Ruqaa
- **Deployment:** Vercel

## المتطلبات (Prerequisites)

- **Node.js** >= 18.x (recommended: 22.x)
- **npm** >= 9.x
- **Git**

## التثبيت والتشغيل (Setup)

```bash
# 1. استنساخ المشروع
git clone <repo-url>
cd royaraqamia

# 2. تثبيت الاعتماديات
npm ci

# 3. إعداد متغيرات البيئة
cp .env.example .env.local
# عدّل .env.local حسب الحاجة

# 4. تشغيل خادم التطوير
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000) في المتصفح.

## الأوامر المتاحة (Available Scripts)

| الأمر              | الوصف                         |
| ------------------ | ----------------------------- |
| `npm run dev`      | تشغيل خادم التطوير            |
| `npm run build`    | بناء المشروع للإنتاج          |
| `npm start`        | تشغيل خادم الإنتاج            |
| `npm run lint`     | فحص الكود باستخدام ESLint     |
| `npm run lint:fix` | إصلاح أخطاء ESLint تلقائيًا   |
| `npm run format`   | تنسيق الكود باستخدام Prettier |

## متغيرات البيئة (Environment Variables)

| المتغير                      | الوصف               | القيمة الافتراضية         |
| ---------------------------- | ------------------- | ------------------------- |
| `NEXT_PUBLIC_BASE_URL`       | رابط الموقع الأساسي | `https://royaraqamia.com` |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | رقم واتساب للتواصل  | `963968478904`            |

## هيكل المشروع (Project Structure)

```
app/              # Next.js App Router (pages, layouts, API)
components/       # React components
  navbar/         # Navbar sub-components
  ui/             # shadcn/ui primitives
context/          # React context providers
hooks/            # Custom React hooks
design-system/    # Design tokens
lib/              # Shared utilities & constants
public/           # Static assets
```

## License

All rights reserved. This codebase is PRIVATE and CONFIDENTIAL.

## Contact

contact@royaraqamia.com
