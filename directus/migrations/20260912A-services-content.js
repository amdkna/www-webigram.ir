const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

const statusChoices = {
  choices: [
    { text: 'پیش نویس', value: 'draft', color: '#A2B5CD' },
    { text: 'منتشر شده', value: 'published', color: '#2ECDA7' },
    { text: 'آرشیو شده', value: 'archived', color: '#F7971C' },
  ],
};

async function ensureCollectionMeta(knex, collection, meta) {
  const exists = await knex('directus_collections').where({ collection }).first();
  if (exists) return;

  await knex('directus_collections').insert({
    collection,
    icon: meta.icon ?? null,
    note: meta.note ?? null,
    display_template: meta.display_template ?? null,
    hidden: false,
    singleton: meta.singleton ?? false,
    archive_field: meta.archive_field ?? null,
    archive_app_filter: meta.archive_field ? true : false,
    archive_value: meta.archive_value ?? null,
    unarchive_value: meta.unarchive_value ?? null,
    sort_field: meta.sort_field ?? null,
  });
}

async function ensureFieldMeta(knex, collection, field, meta = {}) {
  const exists = await knex('directus_fields').where({ collection, field }).first();
  if (exists) return;

  await knex('directus_fields').insert({
    collection,
    field,
    special: meta.special ?? null,
    interface: meta.interface ?? null,
    options: meta.options ? JSON.stringify(meta.options) : null,
    display: meta.display ?? null,
    display_options: meta.display_options ? JSON.stringify(meta.display_options) : null,
    readonly: meta.readonly ?? false,
    hidden: meta.hidden ?? false,
    sort: meta.sort ?? null,
    width: meta.width ?? 'full',
    note: meta.note ?? null,
  });
}

async function ensurePublicRead(knex, collection, fields, permissions = null) {
  const exists = await knex('directus_permissions')
    .where({ policy: PUBLIC_POLICY_ID, collection, action: 'read' })
    .first();

  if (exists) return;

  await knex('directus_permissions').insert({
    policy: PUBLIC_POLICY_ID,
    collection,
    action: 'read',
    permissions: permissions ? JSON.stringify(permissions) : null,
    validation: null,
    presets: null,
    fields,
  });
}

async function ensureServicesTable(knex) {
  const exists = await knex.schema.hasTable('services');
  if (exists) return;

  await knex.schema.createTable('services', (table) => {
    table.increments('id').primary();
    table.string('status', 20).notNullable().defaultTo('draft').index();
    table.integer('sort').notNullable().defaultTo(0).index();
    table.string('slug', 120).notNullable().unique();
    table.string('title', 255).notNullable();
    table.text('summary').notNullable();
    table.text('details');
    table.string('icon', 32);
    table.jsonb('tags').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.boolean('featured').notNullable().defaultTo(false);
    table.string('cta_label', 120);
    table.string('cta_url', 500);
    table.string('seo_title', 255);
    table.text('seo_description');
    table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('date_updated', { useTz: true });
  });
}

async function ensureServicesPageTable(knex) {
  const exists = await knex.schema.hasTable('services_page');
  if (exists) return;

  await knex.schema.createTable('services_page', (table) => {
    table.increments('id').primary();
    table.string('hero_kicker', 120);
    table.string('hero_title_before', 255);
    table.string('hero_title_highlight', 255);
    table.string('hero_title_after', 255);
    table.text('hero_description');
    table.string('cta_kicker', 120);
    table.text('cta_title');
    table.text('cta_description');
    table.string('cta_button_label', 120);
    table.string('cta_button_url', 500);
    table.string('seo_title', 255);
    table.text('seo_description');
    table.timestamp('date_updated', { useTz: true });
  });
}

async function configureServices(knex) {
  await ensureCollectionMeta(knex, 'services', {
    icon: 'design_services',
    note: 'فهرست خدمات وبیگرام که در صفحه /services نمایش داده می شود.',
    display_template: '{{title}}',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
    sort_field: 'sort',
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['status', { interface: 'select-dropdown', options: statusChoices, sort: 2, width: 'half', note: 'فقط موارد Published در سایت دیده می شوند.' }],
    ['sort', { interface: 'input', sort: 3, width: 'half', note: 'ترتیب نمایش در صفحه خدمات.' }],
    ['slug', { interface: 'input', sort: 4, width: 'half', note: 'شناسه انگلیسی یکتا؛ مثلا devops-infrastructure' }],
    ['title', { interface: 'input', sort: 5, width: 'full' }],
    ['summary', { interface: 'input-multiline', sort: 6, width: 'full', note: 'متن کوتاه روی کارت خدمت.' }],
    ['details', { interface: 'input-multiline', sort: 7, width: 'full', note: 'توضیح کامل تر خدمت.' }],
    ['icon', { interface: 'input', sort: 8, width: 'half', note: 'یک نشانه کوتاه مثل ⚙ یا ◈.' }],
    ['tags', { interface: 'tags', special: 'cast-json', sort: 9, width: 'full' }],
    ['featured', { interface: 'boolean', sort: 10, width: 'half' }],
    ['cta_label', { interface: 'input', sort: 11, width: 'half' }],
    ['cta_url', { interface: 'input', sort: 12, width: 'full' }],
    ['seo_title', { interface: 'input', sort: 13, width: 'full' }],
    ['seo_description', { interface: 'input-multiline', sort: 14, width: 'full' }],
    ['date_created', { interface: 'datetime', special: 'date-created', readonly: true, sort: 15, width: 'half' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 16, width: 'half' }],
  ];

  for (const [field, meta] of fields) {
    await ensureFieldMeta(knex, 'services', field, meta);
  }

  await ensurePublicRead(
    knex,
    'services',
    'id,sort,slug,title,summary,details,icon,tags,featured,cta_label,cta_url,seo_title,seo_description,date_updated',
    { status: { _eq: 'published' } },
  );
}

async function configureServicesPage(knex) {
  await ensureCollectionMeta(knex, 'services_page', {
    icon: 'web',
    note: 'متن و SEO صفحه خدمات وبیگرام.',
    display_template: 'صفحه خدمات',
    singleton: true,
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['hero_kicker', { interface: 'input', sort: 2, width: 'full' }],
    ['hero_title_before', { interface: 'input', sort: 3, width: 'full' }],
    ['hero_title_highlight', { interface: 'input', sort: 4, width: 'full' }],
    ['hero_title_after', { interface: 'input', sort: 5, width: 'full' }],
    ['hero_description', { interface: 'input-multiline', sort: 6, width: 'full' }],
    ['cta_kicker', { interface: 'input', sort: 7, width: 'full' }],
    ['cta_title', { interface: 'input-multiline', sort: 8, width: 'full' }],
    ['cta_description', { interface: 'input-multiline', sort: 9, width: 'full' }],
    ['cta_button_label', { interface: 'input', sort: 10, width: 'half' }],
    ['cta_button_url', { interface: 'input', sort: 11, width: 'half' }],
    ['seo_title', { interface: 'input', sort: 12, width: 'full' }],
    ['seo_description', { interface: 'input-multiline', sort: 13, width: 'full' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 14, width: 'half' }],
  ];

  for (const [field, meta] of fields) {
    await ensureFieldMeta(knex, 'services_page', field, meta);
  }

  await ensurePublicRead(
    knex,
    'services_page',
    'id,hero_kicker,hero_title_before,hero_title_highlight,hero_title_after,hero_description,cta_kicker,cta_title,cta_description,cta_button_label,cta_button_url,seo_title,seo_description,date_updated',
  );
}

async function seedServices(knex) {
  const [{ count }] = await knex('services').count('* as count');
  if (Number(count) > 0) return;

  const services = [
    {
      status: 'published', sort: 1, slug: 'devops-infrastructure', title: 'DevOps و زیرساخت', icon: '⌁', featured: true,
      summary: 'از CI/CD و Docker تا مانیتورینگ، امنیت و معماری استقرار؛ زیرساختی می سازیم که قابل اتکا، قابل توسعه و قابل نگهداری باشد.',
      details: 'طراحی Pipeline، کانتینرسازی، استقرار روی سرور و Cloud، Reverse Proxy، SSL، مانیتورینگ، Backup، مدیریت محیط های توسعه و Production و بهبود پایداری سرویس ها.',
      tags: JSON.stringify(['CI/CD', 'Docker', 'Linux', 'Nginx', 'Monitoring']),
      cta_label: 'مشاوره DevOps', cta_url: '/#real',
      seo_title: 'خدمات DevOps و زیرساخت', seo_description: 'طراحی و پیاده سازی زیرساخت، CI/CD، Docker، مانیتورینگ و استقرار پایدار سرویس ها.',
    },
    {
      status: 'published', sort: 2, slug: 'automation', title: 'اتوماسیون و یکپارچه سازی', icon: '⚡', featured: true,
      summary: 'کارهای تکراری را حذف می کنیم و سیستم ها را به هم وصل می کنیم تا فرآیندهای واقعی مجموعه با دخالت انسانی کمتر و خطای پایین تر اجرا شوند.',
      details: 'طراحی Workflow، اتصال APIها، فرم ها و CRM، اعلان ها، گزارش گیری، Botها، پردازش فایل و داده و ساخت اتوماسیون های اختصاصی برای فرآیندهای داخلی.',
      tags: JSON.stringify(['Automation', 'API', 'Workflow', 'Integration', 'Bots']),
      cta_label: 'بررسی فرآیند', cta_url: '/#real',
      seo_title: 'طراحی و پیاده سازی اتوماسیون', seo_description: 'اتوماسیون فرآیندها، اتصال سرویس ها و ساخت Workflowهای اختصاصی برای کاهش کارهای تکراری.',
    },
    {
      status: 'published', sort: 3, slug: 'platform-development', title: 'طراحی و ساخت پلتفرم', icon: '◈', featured: true,
      summary: 'از یک مسئله یا ایده اولیه تا محصول قابل استفاده؛ معماری، تجربه کاربری، Backend، Frontend و استقرار را به صورت یک مسیر یکپارچه جلو می بریم.',
      details: 'برای پلتفرم های اختصاصی، MVP، SaaS، سامانه های خدماتی و محصولات داخلی، ابتدا مسئله و جریان کار را مدل می کنیم و بعد راهکار را مرحله به مرحله طراحی و پیاده سازی می کنیم.',
      tags: JSON.stringify(['Platform', 'MVP', 'SaaS', 'Backend', 'Frontend']),
      cta_label: 'شروع طراحی پلتفرم', cta_url: '/#real',
      seo_title: 'طراحی و ساخت پلتفرم اختصاصی', seo_description: 'طراحی معماری و توسعه پلتفرم، MVP و سامانه های اختصاصی از ایده تا استقرار.',
    },
    {
      status: 'published', sort: 4, slug: 'enterprise-panels', title: 'پنل های سازمانی و داشبورد', icon: '▦', featured: false,
      summary: 'پنل مدیریتی و ابزار داخلی را دقیقا مطابق فرآیند سازمان می سازیم؛ نه اینکه سازمان را مجبور کنیم خودش را با یک نرم افزار عمومی تطبیق دهد.',
      details: 'پنل های مدیریت، داشبوردهای عملیاتی، سیستم های ثبت و پیگیری، گزارش ها، نقش ها و سطح دسترسی، گردش تایید و ابزارهای داخلی تحت وب.',
      tags: JSON.stringify(['Admin Panel', 'Dashboard', 'RBAC', 'Reporting', 'Internal Tools']),
      cta_label: 'طراحی پنل سازمانی', cta_url: '/#real',
      seo_title: 'طراحی پنل سازمانی و داشبورد', seo_description: 'ساخت پنل های مدیریتی، داشبورد و ابزارهای داخلی متناسب با فرآیند واقعی سازمان.',
    },
    {
      status: 'published', sort: 5, slug: 'web-development', title: 'وب سایت و وب اپلیکیشن', icon: '◎', featured: false,
      summary: 'سایت شرکتی، لندینگ، ابزار آنلاین یا Web App را با تمرکز روی سرعت، تجربه کاربری، سئو و قابلیت توسعه در آینده طراحی و پیاده سازی می کنیم.',
      details: 'طراحی رابط، توسعه Frontend و Backend، اتصال CMS، فرم ها، سئو فنی، Analytics، بهینه سازی سرعت و استقرار کامل پروژه.',
      tags: JSON.stringify(['Website', 'Web App', 'SEO', 'CMS', 'Performance']),
      cta_label: 'ساخت وب سایت', cta_url: '/#real',
      seo_title: 'طراحی سایت و وب اپلیکیشن', seo_description: 'طراحی و توسعه سایت، لندینگ و وب اپلیکیشن سریع، قابل توسعه و متصل به CMS.',
    },
    {
      status: 'published', sort: 6, slug: 'ai-solutions', title: 'راهکارهای هوش مصنوعی', icon: '✦', featured: false,
      summary: 'هوش مصنوعی را جایی وارد محصول و فرآیند می کنیم که واقعا ارزش ایجاد کند؛ از دستیار داخلی تا پردازش متن، جستجو و Agentهای متصل به ابزارها.',
      details: 'اتصال مدل های زبانی به داده و ابزارهای سازمان، RAG، دستیارهای داخلی، طبقه بندی و استخراج اطلاعات، تولید محتوا و Agentهای کنترل شده برای وظایف مشخص.',
      tags: JSON.stringify(['AI', 'LLM', 'RAG', 'Agents', 'Knowledge Base']),
      cta_label: 'بررسی کاربرد AI', cta_url: '/#real',
      seo_title: 'راهکارهای هوش مصنوعی برای کسب و کار', seo_description: 'طراحی راهکارهای AI، RAG، Agent و دستیارهای متصل به داده و ابزارهای سازمان.',
    },
  ];

  await knex('services').insert(services);
}

async function seedServicesPage(knex) {
  const [{ count }] = await knex('services_page').count('* as count');
  if (Number(count) > 0) return;

  await knex('services_page').insert({
    id: 1,
    hero_kicker: 'خدمات وبیگرام',
    hero_title_before: 'برای هر مسئله،',
    hero_title_highlight: 'راه حل درست',
    hero_title_after: 'را می سازیم.',
    hero_description: 'از زیرساخت و DevOps تا اتوماسیون، پلتفرم، پنل سازمانی و وب سایت؛ اول مسئله را می فهمیم و بعد دقیقا همان چیزی را طراحی و اجرا می کنیم که لازم است.',
    cta_kicker: 'یک مسئله یا ایده دارید؟',
    cta_title: 'از مسئله شروع کنیم.\nراه حل را با هم می سازیم.',
    cta_description: 'لازم نیست از قبل بدانید چه تکنولوژی یا چه نوع نرم افزاری می خواهید. مسئله و نتیجه مورد انتظار را بگویید؛ مسیر فنی را ما طراحی می کنیم.',
    cta_button_label: 'شروع گفتگو',
    cta_button_url: '/#real',
    seo_title: 'خدمات وبیگرام | DevOps، اتوماسیون، پلتفرم و طراحی سایت',
    seo_description: 'خدمات وبیگرام شامل DevOps و زیرساخت، اتوماسیون، طراحی پلتفرم، پنل های سازمانی، وب سایت و راهکارهای هوش مصنوعی است.',
  });
}

export async function up(knex) {
  await ensureServicesTable(knex);
  await ensureServicesPageTable(knex);
  await configureServices(knex);
  await configureServicesPage(knex);
  await seedServices(knex);
  await seedServicesPage(knex);
}

export async function down(knex) {
  await knex('directus_permissions').where({ collection: 'services' }).delete();
  await knex('directus_permissions').where({ collection: 'services_page' }).delete();
  await knex('directus_fields').where({ collection: 'services' }).delete();
  await knex('directus_fields').where({ collection: 'services_page' }).delete();
  await knex('directus_collections').where({ collection: 'services' }).delete();
  await knex('directus_collections').where({ collection: 'services_page' }).delete();
  await knex.schema.dropTableIfExists('services');
  await knex.schema.dropTableIfExists('services_page');
}
