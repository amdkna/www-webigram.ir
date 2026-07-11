# وبیگرام — Webigram

وب‌سایت فارسی و استاتیک وبیگرام، ساخته‌شده با Astro و آماده انتشار روی GitHub Pages.

## اجرای محلی

```bash
npm install
npm run dev
```

## بررسی و ساخت

```bash
npm run check
npm run build
```

## انتشار

هر Push روی شاخه `main`، Workflow موجود در `.github/workflows/deploy.yml` را اجرا می‌کند و خروجی استاتیک را روی GitHub Pages منتشر می‌کند.

آدرس پیش‌فرض پروژه:

`https://amdkna.github.io/www-webigram.ir/`

> برای اتصال دامنه اصلی، مقدار `site` و `base` در `astro.config.mjs` را تغییر دهید، فایل `public/CNAME` اضافه کنید و DNS دامنه را تنظیم کنید.
