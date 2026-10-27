# وبیگرام — Webigram

وب‌سایت فارسی Webigram، ساخته‌شده با Astro و مستقر روی سرور `wbg-001`.

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

## CI/CD

GitHub Actions برای این پروژه استفاده نمی‌شود.

هر Push روی شاخه `main` توسط Jenkins در `https://ci.webigram.ir` پردازش می‌شود:

```text
GitHub main push
  -> Jenkins
  -> build-docker-01
     -> syntax/config checks
     -> npm install/check
     -> API smoke tests
     -> Astro production build
  -> deploy-wbg001
     -> /opt/apps/www-webigram.ir
     -> change-aware runtime update
     -> public health check
     -> automatic rollback on failure
```

Pipeline definition: `Jenkinsfile`

Production application path:

```text
/opt/apps/www-webigram.ir
```

Production URL:

```text
https://webigram.ir
```
