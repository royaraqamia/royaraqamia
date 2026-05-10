# رؤية رقمية (Roya Raqamia) - Digital Vision Website

<div align="center">

![رؤية رقمية](https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80)

**منصة رائدة في التدريب الإلكتروني والاستشارات التقنية والتشبيك الاحترافي**

[![Lighthouse Score](https://img.shields.io/badge/Lighthouse-95%2B-success)](https://developers.google.com/web/tools/lighthouse)
[![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-blue)](https://www.w3.org/WAI/WCAG21/quickref/)
[![RTL Support](https://img.shields.io/badge/RTL-Supported-green)](https://developer.mozilla.org/en-US/docs/Web/CSS/direction)

[الموقع الرسمي](https://royaraqamia.com) • [التوثيق](#documentation) • [الدعم](#support)

</div>

---

## 📋 جدول المحتويات

- [نظرة عامة](#overview)
- [المميزات](#features)
- [التقنيات المستخدمة](#technologies)
- [البدء السريع](#quick-start)
- [البنية](#structure)
- [التوثيق](#documentation)
- [النشر](#deployment)
- [الاختبار](#testing)
- [المساهمة](#contributing)
- [الدعم](#support)
- [الترخيص](#license)

---

## 🎯 نظرة عامة {#overview}

موقع **رؤية رقمية** هو منصة رقمية شاملة تقدم:

- 🎓 **التدريب الإلكتروني المتقدم**: دورات تدريبية في البرمجة، التصميم، التسويق الرقمي، والذكاء الاصطناعي
- 💼 **الاستشارات التعليمية والتقنية**: خدمات استشارية متخصصة للأفراد والمؤسسات
- 🤝 **التشبيك الاحترافي**: منصة تربط الخبراء بأصحاب الأعمال

### الأهداف الرئيسية

✅ تجربة مستخدم استثنائية باللغة العربية (RTL)  
✅ تصميم عصري بثيم داكن وتدرجات (#7766EE & #3F307F)  
✅ أداء عالي (Lighthouse > 90)  
✅ إمكانية الوصول الكاملة (WCAG 2.1 AA)  
✅ تحسين محركات البحث الشامل (SEO)  
✅ استجابة كاملة لجميع الأجهزة  

---

## ✨ المميزات {#features}

### 🎨 التصميم

- **ثيم داكن حديث** مع تدرجات جذابة
- **رسوم متحركة سلسة** (Micro-interactions)
- **تصميم متجاوب** لجميع الأجهزة
- **دعم RTL كامل** للغة العربية
- **خط IBM Plex Sans Arabic** احترافي

### 🚀 الأداء

- **تحميل سريع** (< 3s)
- **تحميل كسول للصور** (Lazy Loading)
- **تحسين الحزم** (Code Splitting)
- **تخزين مؤقت ذكي** (Caching)
- **تحميل مسبق للخطوط** (Font Preloading)

### ♿ إمكانية الوصول

- **متوافق مع WCAG 2.1 AA**
- **تسميات ARIA كاملة**
- **تنقل بلوحة المفاتيح**
- **دعم قارئات الشاشة**
- **نسب تباين ألوان عالية**
- **روابط تخطي المحتوى**

### 📈 تحسين محركات البحث (SEO)

- **بيانات منظمة** (Schema.org)
- **وسوم Meta كاملة**
- **Open Graph & Twitter Cards**
- **خريطة الموقع** (Sitemap)
- **ملف robots.txt**
- **URLs معيارية** (Canonical)

### 🔧 المكونات الرئيسية

- قسم البطل (Hero) مع CTA
- خدمات متعددة (تدريب، استشارات، تشبيك)
- بطاقات الدورات التدريبية
- بطاقات الاستشاريين
- نماذج التشبيك (خبراء وأصحاب أعمال)
- قصص نجاح العملاء
- شارات الثقة والإحصائيات
- مدونة مع تصنيفات وبحث
- أسئلة شائعة (FAQ)
- تذييل شامل
- زر واتساب عائم

---

## 🛠️ التقنيات المستخدمة {#technologies}

### Frontend Framework
- **React 18** - مكتبة UI
- **TypeScript** - Type Safety
- **Vite** - أداة البناء

### Styling
- **Tailwind CSS 4.0** - إطار عمل CSS
- **CSS Modules** - نطاق الأنماط
- **Radix UI** - مكونات واجهة المستخدم

### Components
- **shadcn/ui** - مكتبة المكونات
- **Lucide React** - الأيقونات
- **Recharts** - الرسوم البيانية
- **Motion (Framer Motion)** - الرسوم المتحركة

### SEO & Performance
- **React Helmet** - إدارة Head
- **Intersection Observer** - Lazy Loading
- **Web Vitals** - قياس الأداء

### Development Tools
- **ESLint** - Linting
- **Prettier** - تنسيق الكود
- **Vitest** - الاختبار
- **GitHub Actions** - CI/CD

---

## 🚀 البدء السريع {#quick-start}

### المتطلبات الأساسية

```bash
Node.js >= 18.0.0
npm >= 9.0.0
```

### التثبيت

```bash
# استنساخ المشروع
git clone https://github.com/your-org/roya-raqamia.git
cd roya-raqamia

# تثبيت الاعتماديات
npm install

# تشغيل بيئة التطوير
npm run dev

# فتح في المتصفح
# http://localhost:5173
```

### الأوامر المتاحة

```bash
npm run dev          # تشغيل بيئة التطوير
npm run build        # بناء الإنتاج
npm run preview      # معاينة البناء
npm run lint         # فحص الكود
npm run type-check   # فحص الأنواع
npm run test         # تشغيل الاختبارات
```

---

## 📁 البنية {#structure}

```
roya-raqamia/
├── public/
│   ├── robots.txt          # ملف Robots
│   ├── sitemap.xml         # خريطة الموقع
│   └── assets/             # الأصول الثابتة
├── src/
│   ├── components/
│   │   ├── ui/            # مكونات shadcn/ui
│   │   ├── Navbar.tsx     # شريط التنقل
│   │   ├── Hero.tsx       # قسم البطل
│   │   ├── Services.tsx   # الخدمات
│   │   ├── Blog.tsx       # المدونة
│   │   ├── FAQ.tsx        # الأسئلة الشائعة
│   │   ├── SEO.tsx        # مكون SEO
│   │   └── ...            # مكونات أخرى
│   ├── styles/
│   │   └── globals.css    # الأنماط العامة
│   ├── App.tsx            # المكون الرئيسي
│   └── main.tsx           # نقطة الدخول
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI/CD
├── .htaccess              # Apache config
├── vercel.json            # Vercel config
├── COMPONENT_DOCS.md      # توثيق المكونات
├── DEPLOYMENT_GUIDE.md    # دليل النشر
├── TESTING_GUIDE.md       # دليل الاختبار
└── README.md              # هذا الملف
```

---

## 📚 التوثيق {#documentation}

### المستندات الرئيسية

- 📖 [**توثيق المكونات**](./COMPONENT_DOCS.md) - دليل شامل لجميع المكونات
- 🚀 [**دليل النشر**](./DEPLOYMENT_GUIDE.md) - خطوات النشر والإعداد
- 🧪 [**دليل الاختبار**](./TESTING_GUIDE.md) - استراتيجيات وأدوات الاختبار

### دروس تعليمية

#### إضافة مكون جديد

```tsx
// 1. إنشاء المكون
// components/NewComponent.tsx
export function NewComponent() {
  return (
    <section className="section-spacing">
      <div className="max-w-7xl mx-auto px-4">
        <h2>عنوان القسم</h2>
        {/* المحتوى */}
      </div>
    </section>
  );
}

// 2. إضافة إلى App.tsx
import { NewComponent } from './components/NewComponent';
// ...
<NewComponent />

// 3. توثيق في COMPONENT_DOCS.md
```

#### تخصيص الأنماط

```css
/* styles/globals.css */

/* إضافة متغيرات جديدة */
:root {
  --your-color: 256 70% 67%;
}

/* إضافة فئات مخصصة */
@layer components {
  .your-class {
    /* أنماطك */
  }
}
```

---

## 🌐 النشر {#deployment}

### خيارات النشر

#### Vercel (موصى به)
```bash
npm install -g vercel
vercel login
vercel --prod
```

#### Hostinger
```bash
npm run build
# رفع محتوى مجلد dist/ عبر FTP
```

#### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod
```

**راجع:** [دليل النشر الكامل](./DEPLOYMENT_GUIDE.md)

### الإعدادات البيئية

```env
NODE_ENV=production
VITE_APP_URL=https://royaraqamia.com
VITE_WHATSAPP_NUMBER=+963968478904
VITE_EMAIL=contact@royaraqamia.com
```

---

## 🧪 الاختبار {#testing}

### تشغيل الاختبارات

```bash
# اختبارات الوحدة
npm run test

# اختبار التغطية
npm run test:coverage

# اختبارات E2E
npm run test:e2e
```

### اختبارات الأداء

```bash
# Lighthouse
lighthouse https://royaraqamia.com

# WebPageTest
# https://www.webpagetest.org
```

### اختبارات إمكانية الوصول

```bash
# axe-core
npm run test:a11y

# Manual testing
# استخدم قارئ الشاشة + لوحة المفاتيح
```

**راجع:** [دليل الاختبار الكامل](./TESTING_GUIDE.md)

---

## 🤝 المساهمة {#contributing}

نرحب بالمساهمات! يرجى اتباع هذه الخطوات:

1. **Fork** المشروع
2. إنشاء **فرع** للميزة (`git checkout -b feature/AmazingFeature`)
3. **Commit** التغييرات (`git commit -m 'إضافة ميزة رائعة'`)
4. **Push** إلى الفرع (`git push origin feature/AmazingFeature`)
5. فتح **Pull Request**

### إرشادات المساهمة

- ✅ اتبع نمط الكود الحالي
- ✅ أضف اختبارات للميزات الجديدة
- ✅ وثق التغييرات في COMPONENT_DOCS.md
- ✅ تأكد من اجتياز جميع الاختبارات
- ✅ حافظ على دعم RTL والعربية

---

## 💬 الدعم {#support}

### الاتصال

- 📧 **البريد الإلكتروني:** contact@royaraqamia.com
- 💬 **واتساب:** [+963968478904](https://wa.me/963968478904)
- 🌐 **الموقع:** [royaraqamia.com](https://royaraqamia.com)

### الإبلاغ عن المشاكل

إذا وجدت خطأ أو لديك اقتراح:

1. تحقق من [Issues الموجودة](https://github.com/your-org/roya-raqamia/issues)
2. إنشاء Issue جديد مع:
   - وصف واضح
   - خطوات إعادة الإنتاج
   - لقطات شاشة (إن أمكن)
   - معلومات البيئة

---

## 📊 الحالة

### مقاييس الأداء

- ⚡ **Lighthouse Performance:** 95+
- ♿ **Accessibility:** 98+
- 🎯 **Best Practices:** 95+
- 📈 **SEO:** 100

### التوافق

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🗺️ خارطة الطريق

### نسخة 1.1 (قريبًا)
- [ ] نظام إدارة المحتوى (CMS)
- [ ] لوحة تحكم المستخدم
- [ ] نظام الدفع الإلكتروني
- [ ] تطبيق الجوال (React Native)

### نسخة 2.0 (مستقبلاً)
- [ ] منصة تعلم تفاعلية
- [ ] نظام مكالمات فيديو مدمج
- [ ] تحليلات متقدمة
- [ ] دعم لغات متعددة

---

## 📄 الترخيص {#license}

هذا المشروع مرخص تحت [MIT License](LICENSE).

```
Copyright (c) 2024 رؤية رقمية (Roya Raqamia)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

## 🙏 شكر وتقدير

- **IBM Plex Sans Arabic** - خط عربي احترافي
- **shadcn/ui** - مكتبة مكونات رائعة
- **Tailwind CSS** - إطار عمل CSS قوي
- **Unsplash** - صور عالية الجودة
- المجتمع المفتوح المصدر

---

## 📞 معلومات الاتصال

**رؤية رقمية (Roya Raqamia)**

- 🌐 الموقع: [https://royaraqamia.com](https://royaraqamia.com)
- 📧 البريد: contact@royaraqamia.com
- 💬 واتساب: +963968478904
- 📍 الموقع: دمشق، سوريا

---

<div align="center">

**صنع بـ ❤️ في سوريا**

⭐ إذا أعجبك هذا المشروع، لا تنسى إعطاءه نجمة!

[الموقع الرسمي](https://royaraqamia.com) • [التوثيق](./COMPONENT_DOCS.md) • [دعم](mailto:contact@royaraqamia.com)

</div>
