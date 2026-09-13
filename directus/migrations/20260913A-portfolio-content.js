const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

const statusChoices = {
  choices: [
    { text: 'پیش نویس', value: 'draft', color: '#A2B5CD' },
    { text: 'منتشر شده', value: 'published', color: '#2ECDA7' },
    { text: 'آرشیو شده', value: 'archived', color: '#F7971C' },
  ],
};

async function ensureCollectionMeta(knex, collection, meta = {}) {
  const exists = await knex('directus_collections').where({ collection }).first();
  if (exists) return;

  await knex('directus_collections').insert({
    collection,
    icon: meta.icon ?? null,
    note: meta.note ?? null,
    display_template: meta.display_template ?? null,
    hidden: meta.hidden ?? false,
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

async function ensureRelation(knex, relation) {
  const exists = await knex('directus_relations')
    .where({ many_collection: relation.many_collection, many_field: relation.many_field })
    .first();
  if (exists) return;

  await knex('directus_relations').insert({
    many_collection: relation.many_collection,
    many_field: relation.many_field,
    one_collection: relation.one_collection ?? null,
    one_field: relation.one_field ?? null,
    one_collection_field: null,
    one_allowed_collections: null,
    junction_field: relation.junction_field ?? null,
    sort_field: relation.sort_field ?? null,
    one_deselect_action: relation.one_deselect_action ?? 'nullify',
  });
}

async function ensurePortfolioTable(knex) {
  if (await knex.schema.hasTable('portfolio')) return;

  await knex.schema.createTable('portfolio', (table) => {
    table.increments('id').primary();
    table.string('status', 20).notNullable().defaultTo('draft').index();
    table.integer('sort').notNullable().defaultTo(0).index();
    table.string('slug', 160).notNullable().unique();
    table.string('title', 255).notNullable();
    table.text('summary').notNullable();
    table.text('description');
    table.string('client', 255);
    table.string('year', 40);
    table.string('service', 160);
    table.string('duration', 160);
    table.text('client_request');
    table.text('approach');
    table.text('outcome');
    table.jsonb('technologies').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.boolean('featured').notNullable().defaultTo(false);
    table.uuid('cover_image').nullable().references('id').inTable('directus_files').onDelete('SET NULL');
    table.string('project_url', 500);
    table.string('seo_title', 255);
    table.text('seo_description');
    table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('date_updated', { useTz: true });
  });
}

async function ensurePortfolioPageTable(knex) {
  if (await knex.schema.hasTable('portfolio_page')) return;

  await knex.schema.createTable('portfolio_page', (table) => {
    table.increments('id').primary();
    table.string('hero_kicker', 160);
    table.text('hero_title');
    table.text('hero_description');
    table.string('seo_title', 255);
    table.text('seo_description');
    table.timestamp('date_updated', { useTz: true });
  });
}

async function ensurePortfolioGalleryTable(knex) {
  if (await knex.schema.hasTable('portfolio_gallery')) return;

  await knex.schema.createTable('portfolio_gallery', (table) => {
    table.increments('id').primary();
    table.integer('portfolio_id').notNullable().references('id').inTable('portfolio').onDelete('CASCADE');
    table.uuid('directus_files_id').notNullable().references('id').inTable('directus_files').onDelete('CASCADE');
    table.integer('sort').notNullable().defaultTo(0);
    table.unique(['portfolio_id', 'directus_files_id']);
  });
}

async function configurePortfolio(knex) {
  await ensureCollectionMeta(knex, 'portfolio', {
    icon: 'work',
    note: 'نمونه کارها و Case Studyهای وبیگرام. هر پروژه را به شکل مسئله، مسیر اجرا و نتیجه مستند کنید.',
    display_template: '{{title}}',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
    sort_field: 'sort',
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['status', { interface: 'select-dropdown', options: statusChoices, sort: 2, width: 'half', note: 'فقط پروژه های Published در سایت نمایش داده می شوند.' }],
    ['sort', { interface: 'input', sort: 3, width: 'half', note: 'ترتیب نمایش در صفحه نمونه کارها.' }],
    ['featured', { interface: 'boolean', sort: 4, width: 'half', note: 'برای مشخص کردن پروژه های شاخص.' }],
    ['slug', { interface: 'input', sort: 5, width: 'half', note: 'شناسه انگلیسی یکتا؛ مثلا live-webigram' }],
    ['title', { interface: 'input', sort: 6, width: 'full' }],
    ['summary', { interface: 'input-multiline', sort: 7, width: 'full', note: 'خلاصه کوتاه برای کارت پروژه.' }],
    ['client', { interface: 'input', sort: 8, width: 'half', note: 'نام مشتری یا محصول داخلی.' }],
    ['service', { interface: 'input', sort: 9, width: 'half', note: 'نوع خدمت؛ مثلا DevOps، اتوماسیون یا طراحی پلتفرم.' }],
    ['year', { interface: 'input', sort: 10, width: 'half' }],
    ['duration', { interface: 'input', sort: 11, width: 'half', note: 'مدت واقعی پروژه؛ مثلا ۳ هفته یا ۲ ماه. اگر مطمئن نیستید خالی بگذارید.' }],
    ['client_request', { interface: 'input-multiline', sort: 12, width: 'full', note: 'مشتری چه مسئله ای داشت و دقیقا چه نتیجه ای می خواست؟' }],
    ['approach', { interface: 'input-multiline', sort: 13, width: 'full', note: 'کار را چگونه تحلیل، طراحی و اجرا کردیم؟' }],
    ['outcome', { interface: 'input-multiline', sort: 14, width: 'full', note: 'در نهایت چه چیزی تحویل شد یا چه مسئله ای حل شد؟' }],
    ['description', { interface: 'input-rich-text-html', sort: 15, width: 'full', note: 'توضیحات تکمیلی اختیاری برای Case Study.' }],
    ['technologies', { interface: 'tags', special: 'cast-json', sort: 16, width: 'full' }],
    ['cover_image', { interface: 'file-image', special: 'file', sort: 17, width: 'half', note: 'تصویر اصلی پروژه.' }],
    ['gallery', { interface: 'files', special: 'm2m', sort: 18, width: 'full', note: 'چند تصویر از صفحات یا خروجی پروژه.' }],
    ['project_url', { interface: 'input', sort: 19, width: 'full' }],
    ['seo_title', { interface: 'input', sort: 20, width: 'full' }],
    ['seo_description', { interface: 'input-multiline', sort: 21, width: 'full' }],
    ['date_created', { interface: 'datetime', special: 'date-created', readonly: true, sort: 22, width: 'half' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 23, width: 'half' }],
  ];

  for (const [field, meta] of fields) {
    await ensureFieldMeta(knex, 'portfolio', field, meta);
  }

  await ensurePublicRead(
    knex,
    'portfolio',
    'id,sort,slug,title,summary,description,client,year,service,duration,client_request,approach,outcome,technologies,featured,cover_image,project_url,seo_title,seo_description,date_updated',
    { status: { _eq: 'published' } },
  );
}

async function configurePortfolioPage(knex) {
  await ensureCollectionMeta(knex, 'portfolio_page', {
    icon: 'view_quilt',
    note: 'متن و SEO صفحه نمونه کارهای وبیگرام.',
    display_template: 'صفحه نمونه کارها',
    singleton: true,
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['hero_kicker', { interface: 'input', sort: 2, width: 'full' }],
    ['hero_title', { interface: 'input-multiline', sort: 3, width: 'full' }],
    ['hero_description', { interface: 'input-multiline', sort: 4, width: 'full' }],
    ['seo_title', { interface: 'input', sort: 5, width: 'full' }],
    ['seo_description', { interface: 'input-multiline', sort: 6, width: 'full' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 7, width: 'half' }],
  ];

  for (const [field, meta] of fields) {
    await ensureFieldMeta(knex, 'portfolio_page', field, meta);
  }

  await ensurePublicRead(
    knex,
    'portfolio_page',
    'id,hero_kicker,hero_title,hero_description,seo_title,seo_description,date_updated',
  );
}

async function configurePortfolioGallery(knex) {
  await ensureCollectionMeta(knex, 'portfolio_gallery', {
    icon: 'photo_library',
    note: 'Junction collection for portfolio image galleries.',
    display_template: '{{id}}',
    hidden: true,
    sort_field: 'sort',
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['portfolio_id', { interface: 'select-dropdown-m2o', special: 'm2o', sort: 2, width: 'half' }],
    ['directus_files_id', { interface: 'file-image', special: 'm2o', sort: 3, width: 'half' }],
    ['sort', { interface: 'input', sort: 4, width: 'half' }],
  ];

  for (const [field, meta] of fields) {
    await ensureFieldMeta(knex, 'portfolio_gallery', field, meta);
  }

  await ensureRelation(knex, {
    many_collection: 'portfolio',
    many_field: 'cover_image',
    one_collection: 'directus_files',
    one_deselect_action: 'nullify',
  });

  await ensureRelation(knex, {
    many_collection: 'portfolio_gallery',
    many_field: 'portfolio_id',
    one_collection: 'portfolio',
    one_field: 'gallery',
    junction_field: 'directus_files_id',
    sort_field: 'sort',
    one_deselect_action: 'delete',
  });

  await ensureRelation(knex, {
    many_collection: 'portfolio_gallery',
    many_field: 'directus_files_id',
    one_collection: 'directus_files',
    junction_field: 'portfolio_id',
    one_deselect_action: 'delete',
  });

  await ensurePublicRead(
    knex,
    'portfolio_gallery',
    'id,portfolio_id,directus_files_id,sort',
    { portfolio_id: { status: { _eq: 'published' } } },
  );
}

async function seedPortfolio(knex) {
  const [{ count }] = await knex('portfolio').count('* as count');
  if (Number(count) > 0) return;

  const projects = [
    {
      status: 'published', sort: 1, slug: 'live-webigram', featured: true,
      title: 'Coursino Live — پلتفرم وبینار زنده',
      summary: 'یک پلتفرم self-hosted برای کلاس و وبینار زنده در مرورگر؛ با نقش های واقعی، ویدیو و صدای بلادرنگ و کنترل کامل روی زیرساخت.',
      client: 'Webigram / Coursino', year: '2026', service: 'طراحی و ساخت پلتفرم', duration: null,
      client_request: 'هدف، ساخت یک بستر مستقل برای برگزاری وبینار و کلاس زنده بود؛ بدون وابستگی به سرویس های آماده، با ورود ساده مهمان، نقش های مشخص برای ارائه دهنده و پشتیبان و امکان کنترل تجربه جلسه از داخل مرورگر.',
      approach: 'رابط و منطق برنامه با Next.js ساخته شد و مسیر رسانه زنده بر پایه LiveKit و WebRTC طراحی شد تا ویدیو و صدا مستقیما از مسیر realtime عبور کنند. احراز هویت ارائه دهنده، اتاق های مبتنی بر URL، Edge Nginx، Docker Compose و استقرار خودکار با GitHub Actions نیز به عنوان بخشی از معماری پیاده سازی شدند.',
      outcome: 'نسخه عملیاتی روی live.webigram.ir در دسترس است و اکنون ورود نقش محور، پخش ویدیو تا 1080p، صدای دوطرفه، گفتگو و ورود مهمان را در یک بستر self-hosted ارائه می دهد.',
      description: '<p>این پروژه از ابتدا به عنوان یک محصول وبینار طراحی شد، نه یک جلسه ویدیویی عمومی. بنابراین معماری آن حول یک ارائه دهنده، مخاطبان، نقش های مدیریتی و تجربه پایدار دریافت صدا و تصویر شکل گرفت.</p>',
      technologies: JSON.stringify(['Next.js', 'LiveKit', 'WebRTC', 'Docker', 'Nginx', 'GitHub Actions']),
      project_url: 'https://live.webigram.ir',
      seo_title: 'Coursino Live | نمونه کار Webigram',
      seo_description: 'طراحی و پیاده سازی پلتفرم self-hosted وبینار زنده با Next.js، LiveKit، WebRTC، Docker و Nginx.',
    },
    {
      status: 'published', sort: 2, slug: 'updateshid', featured: true,
      title: 'Updateshid — پلتفرم آموزش هوش مصنوعی',
      summary: 'پلتفرمی آموزشی برای تبدیل شلوغی ابزارها و مفاهیم هوش مصنوعی به مسیرهای یادگیری روشن، دانش نامه، معرفی ابزار و تجربه های آموزشی عملی.',
      client: 'Updateshid', year: '2026', service: 'طراحی پلتفرم و وب', duration: null,
      client_request: 'مسئله اصلی این بود که دنیای AI با سرعت زیادی تغییر می کند و برای کاربر تازه وارد، ابزارها و اصطلاحات خیلی زود تبدیل به یک فهرست شلوغ می شوند. محصول باید مسیر یادگیری را ساده کند و در کنار آموزش، وبینار و دوره را هم پوشش دهد.',
      approach: 'ساختار محتوا بر اساس مسیر یادگیری، دانش نامه و دسته بندی ابزارها طراحی شد و صفحه های اختصاصی برای وبینار، ثبت نام و محتوای آموزشی به آن اضافه شد. پروژه به صورت مستقل deploy می شود و محتوای آموزشی و تجربه های تعاملی به شکل مرحله ای قابل توسعه هستند.',
      outcome: 'Updateshid اکنون یک سایت آموزشی فعال با مسیرهای موضوعی، دانش نامه، فهرست ابزارهای AI و صفحات وبینار و دوره است؛ به جای معرفی پراکنده ابزارها، کاربر را به سمت یک مسیر قابل فهم هدایت می کند.',
      description: '<p>تمرکز این پروژه بیشتر از یک لندینگ ساده بود: معماری اطلاعات باید بتواند هم محتوای پایه، هم ابزارها و هم دوره های عملی را بدون شلوغ شدن تجربه کاربری کنار هم نگه دارد.</p>',
      technologies: JSON.stringify(['Web', 'Docker', 'Nginx', 'GitHub Actions']),
      project_url: 'https://updateshid.ir',
      seo_title: 'Updateshid | نمونه کار Webigram',
      seo_description: 'طراحی و توسعه پلتفرم آموزشی هوش مصنوعی Updateshid با مسیرهای یادگیری، دانش نامه، معرفی ابزار و وبینار.',
    },
    {
      status: 'published', sort: 3, slug: 'aarashnaderian', featured: false,
      title: 'aarashnaderian.ir — وب سایت شخصی و حرفه ای',
      summary: 'یک وب سایت شخصی برای ارائه هویت حرفه ای، تجربه، پروژه ها و حضور آنلاین در قالبی مستقل و قابل توسعه.',
      client: 'Arash Naderian', year: null, service: 'طراحی وب سایت', duration: null,
      client_request: 'نیاز به یک پایگاه شخصی مستقل بود که به جای تکیه بر پروفایل شبکه های اجتماعی، بتواند تجربه حرفه ای، پروژه ها و معرفی فرد را در یک آدرس اختصاصی ارائه کند.',
      approach: 'ساختار سایت با تمرکز روی خوانایی، معرفی سریع هویت حرفه ای، نمایش تجربه و پروژه ها و قابلیت توسعه محتوای آینده طراحی شد. نسخه وب به صورت responsive و با تمرکز روی ارائه مستقیم اطلاعات پیاده سازی و deploy شد.',
      outcome: 'یک حضور آنلاین مستقل و قابل کنترل برای برند شخصی ایجاد شد که می تواند به عنوان مرجع اصلی معرفی، رزومه و پروژه ها استفاده شود.',
      description: '<p>برای وب سایت شخصی، هدف اصلی این بود که خود سایت مزاحم محتوا نباشد؛ هویت حرفه ای و پروژه ها باید سریع تر از جلوه های نمایشی دیده شوند.</p>',
      technologies: JSON.stringify(['Web', 'Responsive Design', 'SEO']),
      project_url: 'https://aarashnaderian.ir',
      seo_title: 'aarashnaderian.ir | نمونه کار Webigram',
      seo_description: 'طراحی و توسعه وب سایت شخصی و حرفه ای aarashnaderian.ir.',
    },
    {
      status: 'published', sort: 4, slug: 'tpazar', featured: true,
      title: 'TPazar — وب سایت و سامانه محتوایی شرکت پخش',
      summary: 'وب سایت شرکتی و کاتالوگ محصولات برای تجارت کاران پدیده آذربایجان؛ با ساختار محصولات، خدمات، برندها، ویزیتورها و فرم های همکاری و سفارش.',
      client: 'تجارت کاران پدیده آذربایجان', year: '2026', service: 'طراحی و توسعه وب', duration: null,
      client_request: 'مشتری به سایتی نیاز داشت که فقط معرفی شرکت نباشد؛ باید محصولات و دسته بندی ها را نمایش دهد، برند اختصاصی را معرفی کند، شبکه ویزیتورها را پوشش دهد و مسیر مشخصی برای همکاری و ثبت سفارش داشته باشد.',
      approach: 'فرانت با Next.js و TypeScript پیاده سازی شد و ساختار داده برای محصولات و محتوای سایت به شکلی طراحی شد که از بخش مدیریت قابل کنترل باشد. پروژه containerized شد و لایه های محتوا، فرم ها و deployment به صورت یکپارچه کنار هم قرار گرفتند.',
      outcome: 'سایت tpazar.ir اکنون محصولات، خدمات، برند نوپاک، دسته بندی ها، شبکه ویزیتورها و مسیرهای سفارش و همکاری را در یک تجربه واحد ارائه می کند و محتوای آن از ساختار مدیریتی پروژه قابل نگهداری است.',
      description: '<p>این پروژه نمونه ای از تبدیل یک سایت شرکتی ساده به یک ابزار واقعی برای فروش و عملیات است؛ جایی که کاتالوگ، معرفی خدمات و فرم های کسب و کار در کنار هم قرار می گیرند.</p>',
      technologies: JSON.stringify(['Next.js', 'TypeScript', 'React', 'Prisma', 'Docker']),
      project_url: 'https://tpazar.ir',
      seo_title: 'TPazar | نمونه کار Webigram',
      seo_description: 'طراحی و توسعه وب سایت و سامانه محتوایی تجارت کاران پدیده آذربایجان با Next.js و زیرساخت containerized.',
    },
    {
      status: 'published', sort: 5, slug: 'ditamin-devops', featured: true,
      title: 'Ditamin — زیرساخت DevOps و استقرار',
      summary: 'طراحی و پیاده سازی مسیر استقرار و زیرساخت وب برای محیط های توسعه و Production با جداسازی دامنه ها، TLS و deployment قابل تکرار.',
      client: 'Ditamin', year: '2026', service: 'DevOps و زیرساخت', duration: null,
      client_request: 'پروژه به یک مسیر استقرار قابل اتکا برای محیط توسعه و Production نیاز داشت؛ به شکلی که سرویس ها روی دامنه های مشخص، با TLS و تنظیمات قابل نگهداری اجرا شوند و deployment به کار دستی وابسته نباشد.',
      approach: 'محیط های dev و production از هم تفکیک شدند، دامنه ها و TLS برای هر محیط تعریف شد و سرویس های وب داخل معماری containerized قرار گرفتند. مسیر CI/CD و reverse proxy نیز به شکلی طراحی شد که استقرارهای بعدی تکرارپذیر و قابل کنترل باشند.',
      outcome: 'زیرساختی ایجاد شد که توسعه و Production را از هم جدا می کند، انتشار نسخه ها را منظم تر می کند و مدیریت دامنه، TLS و سرویس های وب را در یک الگوی عملیاتی مشخص قرار می دهد.',
      description: '<p>ارزش این پروژه بیشتر در چیزی است که کاربر نهایی نمی بیند: تبدیل استقرار دستی و شکننده به یک مسیر مشخص برای build، deploy و نگهداری سرویس.</p>',
      technologies: JSON.stringify(['Docker', 'Nginx', 'CI/CD', 'Linux', 'TLS', 'Next.js']),
      project_url: 'https://ditamin.ir',
      seo_title: 'Ditamin DevOps | نمونه کار Webigram',
      seo_description: 'طراحی زیرساخت، CI/CD، Docker، Nginx و TLS برای محیط های توسعه و Production پروژه Ditamin.',
    },
    {
      status: 'published', sort: 6, slug: 'banousa-devops', featured: true,
      title: 'Banousa — DevOps، استقرار و Gateway پیام رسان',
      summary: 'زیرساخت deployment برای سرویس های Banousa به همراه مسیرهای جداگانه پنل و Bot و یک Gateway مستقل برای دسترسی پایدار به Telegram.',
      client: 'Banousa', year: '2026', service: 'DevOps و زیرساخت', duration: null,
      client_request: 'سرویس های مختلف Banousa، از پنل تا Bot، به استقرارهای مستقل و قابل کنترل نیاز داشتند. برای بخش Telegram نیز محدودیت های شبکه باعث شد مسیر ارتباطی مستقلی خارج از سرور اصلی لازم باشد.',
      approach: 'deployment پنل و Bot از هم جدا شد و runner و pipeline مستقل برای هر بخش در نظر گرفته شد. برای Telegram یک Gateway روی سرور خارج از ایران طراحی و deploy شد تا سرویس اصلی بدون وابستگی مستقیم به دسترسی شبکه محلی بتواند ارتباط خود را برقرار کند.',
      outcome: 'اجزای Banousa به مسیرهای deployment مستقل تبدیل شدند و Gateway پیام رسان، وابستگی سرویس Bot به محدودیت مستقیم شبکه سرور اصلی را کاهش داد. نتیجه، معماری قابل نگهداری تر و عیب یابی ساده تر برای چند سرویس مستقل بود.',
      description: '<p>در این پروژه مسئله فقط deploy کردن یک اپلیکیشن نبود؛ چند سرویس با نیازهای متفاوت باید طوری از هم جدا می شدند که خرابی یا تغییر یک بخش، کل مسیر استقرار را درگیر نکند.</p>',
      technologies: JSON.stringify(['Docker', 'CI/CD', 'Linux', 'Nginx', 'Telegram Gateway', 'GitHub Actions']),
      project_url: 'https://banousa.ir',
      seo_title: 'Banousa DevOps | نمونه کار Webigram',
      seo_description: 'طراحی مسیرهای استقرار، CI/CD و Gateway مستقل Telegram برای سرویس های Banousa.',
    },
    {
      status: 'published', sort: 7, slug: 'noyan-backup-automation', featured: true,
      title: 'نویان — اتوماسیون پشتیبان گیری زیرساخت',
      summary: 'اتوماسیون فرآیند Backup برای کاهش کار دستی، استاندارد کردن اجرای پشتیبان گیری و قابل پیگیری کردن وضعیت عملیات در زیرساخت سازمانی.',
      client: 'نویان', year: null, service: 'DevOps و اتوماسیون', duration: null,
      client_request: 'فرآیند پشتیبان گیری در محیط سازمانی نباید به اجرای دستی و حافظه افراد وابسته باشد. نیاز اصلی، اجرای قابل تکرار، کنترل وضعیت و کاهش احتمال خطای انسانی در عملیات Backup بود.',
      approach: 'فرآیندهای تکراری Backup به صورت workflow و script استاندارد شدند و منطق اجرای دوره ای، ثبت وضعیت و کنترل خطا در طراحی قرار گرفت. جزئیات حساس زیرساخت در مستند عمومی پروژه نمایش داده نمی شوند.',
      outcome: 'بخشی از عملیات تکراری پشتیبان گیری از حالت دستی خارج شد و به یک فرآیند قابل تکرار و قابل پیگیری تبدیل شد؛ در نتیجه وابستگی به اجرای انسانی و احتمال فراموش شدن مراحل کاهش پیدا کرد.',
      description: '<p>این Case Study عمدا جزئیات فنی حساس، آدرس ها، دسترسی ها و ساختار داخلی سازمان را منتشر نمی کند. تمرکز نمونه کار روی مسئله، روش اتوماسیون و نتیجه عملیاتی است.</p>',
      technologies: JSON.stringify(['Automation', 'Backup', 'Linux', 'Scripting', 'Monitoring']),
      project_url: null,
      seo_title: 'اتوماسیون Backup سازمانی | نمونه کار Webigram',
      seo_description: 'طراحی و پیاده سازی اتوماسیون فرآیند پشتیبان گیری برای کاهش کار دستی و خطای انسانی در زیرساخت سازمانی.',
    },
  ];

  await knex('portfolio').insert(projects);
}

async function seedPortfolioPage(knex) {
  const [{ count }] = await knex('portfolio_page').count('* as count');
  if (Number(count) > 0) return;

  await knex('portfolio_page').insert({
    id: 1,
    hero_kicker: 'نمونه کارهای وبیگرام',
    hero_title: 'پشت هر پروژه، یک مسئله واقعی و یک مسیر اجرایی وجود دارد.',
    hero_description: 'اینجا فقط تصویر خروجی را نمی بینید؛ برای هر پروژه توضیح می دهیم مسئله چه بود، کار را چطور پیش بردیم و چه چیزی در نهایت تحویل شد.',
    seo_title: 'نمونه کارهای وبیگرام | Case Study پروژه ها',
    seo_description: 'نمونه پروژه های وبیگرام در طراحی پلتفرم، توسعه وب، DevOps و اتوماسیون همراه با شرح مسئله، مسیر اجرا و نتیجه.',
  });
}

export async function up(knex) {
  await ensurePortfolioTable(knex);
  await ensurePortfolioPageTable(knex);
  await ensurePortfolioGalleryTable(knex);
  await configurePortfolio(knex);
  await configurePortfolioPage(knex);
  await configurePortfolioGallery(knex);
  await seedPortfolio(knex);
  await seedPortfolioPage(knex);
}

export async function down(knex) {
  await knex('directus_permissions').whereIn('collection', ['portfolio', 'portfolio_page', 'portfolio_gallery']).delete();
  await knex('directus_relations').whereIn('many_collection', ['portfolio', 'portfolio_gallery']).delete();
  await knex('directus_fields').whereIn('collection', ['portfolio', 'portfolio_page', 'portfolio_gallery']).delete();
  await knex('directus_collections').whereIn('collection', ['portfolio', 'portfolio_page', 'portfolio_gallery']).delete();
  await knex.schema.dropTableIfExists('portfolio_gallery');
  await knex.schema.dropTableIfExists('portfolio');
  await knex.schema.dropTableIfExists('portfolio_page');
}
