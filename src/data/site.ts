/** Shared site data: navigation, footer links and fallback service content. */

export const site = {
  name: 'وبیگرام',
  latinName: 'Webigram',
  url: 'https://webigram.ir',
  cmsUrl: 'https://cms.webigram.ir',
  tagline: 'از ایده تا اجرای واقعی',
  description:
    'وبیگرام ایده شما را از طرح اولیه تا یک راهکار دیجیتال واقعی همراهی می‌کند؛ از DevOps و اتوماسیون تا پلتفرم، پنل سازمانی و وب‌سایت.',
};

export type NavKey = 'home' | 'services' | 'portfolio' | 'blog' | 'tools' | 'about' | 'contact';

export const mainNav: { key: NavKey; label: string; href: string }[] = [
  { key: 'home', label: 'خانه', href: '/' },
  { key: 'services', label: 'خدمات', href: '/services/' },
  { key: 'portfolio', label: 'نمونه‌کارها', href: '/portfolio/' },
  { key: 'blog', label: 'بلاگ', href: '/blog/' },
  { key: 'tools', label: 'ابزارها', href: '/tools/' },
  { key: 'about', label: 'درباره‌ما', href: '/#about' },
];

export const contactLink = { key: 'contact' as NavKey, label: 'تماس با ما', href: '/contact/' };

export const toolLinks = [
  { label: 'دکتر وردپرس', href: '/tools/wordpress-doctor/' },
  { label: 'دکتر وب‌سایت', href: '/tools/website-doctor/' },
  { label: 'تحلیل GEO', href: '/tools/geo-analyzer/' },
  { label: 'بررسی نام برند', href: '/tools/brand-checker/' },
  { label: 'لینک گوگل کلندر', href: '/tools/google-calendar-link/' },
  { label: 'آی‌پی من', href: '/myip/' },
];

export interface Service {
  slug: string;
  title: string;
  icon: string;
  featured: boolean;
  summary: string;
  details: string;
  tags: string[];
  cta_label: string;
  cta_url: string;
}

export const services: Service[] = [
  {
    slug: 'devops-infrastructure',
    title: 'DevOps و زیرساخت',
    icon: '⌁',
    featured: true,
    summary: 'از CI/CD و Docker تا مانیتورینگ، امنیت و معماری استقرار؛ زیرساختی می سازیم که قابل اتکا، قابل توسعه و قابل نگهداری باشد.',
    details: 'طراحی Pipeline، کانتینرسازی، استقرار روی سرور و Cloud، Reverse Proxy، SSL، مانیتورینگ، Backup و مدیریت محیط های توسعه و Production.',
    tags: ['CI/CD', 'Docker', 'Linux', 'Nginx', 'Monitoring'],
    cta_label: 'مشاوره DevOps',
    cta_url: '/contact/',
  },
  {
    slug: 'automation',
    title: 'اتوماسیون و یکپارچه سازی',
    icon: '⚡',
    featured: true,
    summary: 'کارهای تکراری را حذف می کنیم و سیستم ها را به هم وصل می کنیم تا فرآیندهای واقعی مجموعه با دخالت انسانی کمتر و خطای پایین تر اجرا شوند.',
    details: 'طراحی Workflow، اتصال APIها، فرم ها و CRM، اعلان ها، گزارش گیری، Botها، پردازش فایل و داده و ساخت اتوماسیون های اختصاصی.',
    tags: ['Automation', 'API', 'Workflow', 'Integration', 'Bots'],
    cta_label: 'بررسی فرآیند',
    cta_url: '/contact/',
  },
  {
    slug: 'platform-development',
    title: 'طراحی و ساخت پلتفرم',
    icon: '◈',
    featured: true,
    summary: 'از یک مسئله یا ایده اولیه تا محصول قابل استفاده؛ معماری، تجربه کاربری، Backend، Frontend و استقرار را به صورت یک مسیر یکپارچه جلو می بریم.',
    details: 'برای پلتفرم های اختصاصی، MVP، SaaS و محصولات داخلی، ابتدا مسئله و جریان کار را مدل می کنیم و بعد راهکار را مرحله به مرحله می سازیم.',
    tags: ['Platform', 'MVP', 'SaaS', 'Backend', 'Frontend'],
    cta_label: 'شروع طراحی پلتفرم',
    cta_url: '/contact/',
  },
  {
    slug: 'enterprise-panels',
    title: 'پنل های سازمانی و داشبورد',
    icon: '▦',
    featured: false,
    summary: 'پنل مدیریتی و ابزار داخلی را دقیقا مطابق فرآیند سازمان می سازیم؛ نه اینکه سازمان را مجبور کنیم خودش را با یک نرم افزار عمومی تطبیق دهد.',
    details: 'پنل های مدیریت، داشبوردهای عملیاتی، سیستم های ثبت و پیگیری، گزارش ها، نقش ها و سطح دسترسی، گردش تایید و ابزارهای داخلی تحت وب.',
    tags: ['Admin Panel', 'Dashboard', 'RBAC', 'Reporting', 'Internal Tools'],
    cta_label: 'طراحی پنل سازمانی',
    cta_url: '/contact/',
  },
  {
    slug: 'web-development',
    title: 'وب سایت و وب اپلیکیشن',
    icon: '◎',
    featured: false,
    summary: 'سایت شرکتی، لندینگ، ابزار آنلاین یا Web App را با تمرکز روی سرعت، تجربه کاربری، سئو و قابلیت توسعه در آینده طراحی و پیاده سازی می کنیم.',
    details: 'طراحی رابط، توسعه Frontend و Backend، اتصال CMS، فرم ها، سئو فنی، Analytics، بهینه سازی سرعت و استقرار کامل پروژه.',
    tags: ['Website', 'Web App', 'SEO', 'CMS', 'Performance'],
    cta_label: 'ساخت وب سایت',
    cta_url: '/contact/',
  },
  {
    slug: 'ai-solutions',
    title: 'راهکارهای هوش مصنوعی',
    icon: '✦',
    featured: false,
    summary: 'هوش مصنوعی را جایی وارد محصول و فرآیند می کنیم که واقعا ارزش ایجاد کند؛ از دستیار داخلی تا پردازش متن، جستجو و Agentهای متصل به ابزارها.',
    details: 'اتصال مدل های زبانی به داده و ابزارهای سازمان، RAG، دستیارهای داخلی، طبقه بندی و استخراج اطلاعات و Agentهای کنترل شده برای وظایف مشخص.',
    tags: ['AI', 'LLM', 'RAG', 'Agents', 'Knowledge Base'],
    cta_label: 'بررسی کاربرد AI',
    cta_url: '/contact/',
  },
];
