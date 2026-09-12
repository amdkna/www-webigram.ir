const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';
const PORTFOLIO_FOLDER_ID = 'f3d0bb37-30d0-4b1f-9bf0-7f34cecb5001';
const BLOG_FOLDER_ID = 'f3d0bb37-30d0-4b1f-9bf0-7f34cecb5002';

const statusChoices = {
  choices: [
    { text: 'پیش نویس', value: 'draft', color: '#A2B5CD' },
    { text: 'منتشر شده', value: 'published', color: '#2ECDA7' },
    { text: 'آرشیو شده', value: 'archived', color: '#F7971C' },
  ],
};

const contactStatusChoices = {
  choices: [
    { text: 'جدید', value: 'new', color: '#6644FF' },
    { text: 'تماس گرفته شد', value: 'contacted', color: '#2ECDA7' },
    { text: 'بسته شده', value: 'closed', color: '#8A8F9C' },
    { text: 'اسپم', value: 'spam', color: '#E35169' },
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
    locked: meta.locked ?? false,
    readonly: meta.readonly ?? false,
    hidden: meta.hidden ?? false,
    sort: meta.sort ?? null,
    width: meta.width ?? 'full',
    note: meta.note ?? null,
  });
}

async function ensureRelationMeta(knex, manyCollection, manyField, oneCollection, meta = {}) {
  const exists = await knex('directus_relations')
    .where({ many_collection: manyCollection, many_field: manyField })
    .first();
  if (exists) return;

  await knex('directus_relations').insert({
    many_collection: manyCollection,
    many_field: manyField,
    one_collection: oneCollection,
    one_field: meta.one_field ?? null,
    one_collection_field: meta.one_collection_field ?? null,
    one_allowed_collections: meta.one_allowed_collections ?? null,
    junction_field: meta.junction_field ?? null,
    sort_field: meta.sort_field ?? null,
    one_deselect_action: meta.one_deselect_action ?? 'nullify',
  });
}

async function ensurePermission(knex, collection, action, fields, options = {}) {
  const exists = await knex('directus_permissions')
    .where({ policy: PUBLIC_POLICY_ID, collection, action })
    .first();
  if (exists) return;

  await knex('directus_permissions').insert({
    policy: PUBLIC_POLICY_ID,
    collection,
    action,
    fields,
    permissions: options.permissions ? JSON.stringify(options.permissions) : null,
    validation: options.validation ? JSON.stringify(options.validation) : null,
    presets: options.presets ? JSON.stringify(options.presets) : null,
  });
}

async function ensureFolder(knex, id, name) {
  const exists = await knex('directus_folders').where({ id }).first();
  if (!exists) await knex('directus_folders').insert({ id, name, parent: null });
}

async function createTables(knex) {
  if (!(await knex.schema.hasTable('portfolio'))) {
    await knex.schema.createTable('portfolio', (table) => {
      table.increments('id').primary();
      table.string('status', 20).notNullable().defaultTo('draft').index();
      table.integer('sort').notNullable().defaultTo(0).index();
      table.string('slug', 140).notNullable().unique();
      table.string('title', 255).notNullable();
      table.text('summary').notNullable();
      table.text('description');
      table.string('client', 255);
      table.string('year', 20);
      table.string('service', 255);
      table.jsonb('technologies').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
      table.uuid('cover_image').references('id').inTable('directus_files').onDelete('SET NULL');
      table.boolean('featured').notNullable().defaultTo(false);
      table.string('project_url', 500);
      table.string('seo_title', 255);
      table.text('seo_description');
      table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('date_updated', { useTz: true });
    });
  }

  if (!(await knex.schema.hasTable('portfolio_gallery'))) {
    await knex.schema.createTable('portfolio_gallery', (table) => {
      table.increments('id').primary();
      table.integer('portfolio_id').notNullable().references('id').inTable('portfolio').onDelete('CASCADE');
      table.uuid('directus_files_id').notNullable().references('id').inTable('directus_files').onDelete('CASCADE');
      table.integer('sort').notNullable().defaultTo(0);
      table.unique(['portfolio_id', 'directus_files_id']);
    });
  }

  if (!(await knex.schema.hasTable('portfolio_page'))) {
    await knex.schema.createTable('portfolio_page', (table) => {
      table.increments('id').primary();
      table.string('hero_kicker', 120);
      table.string('hero_title', 255);
      table.text('hero_description');
      table.string('seo_title', 255);
      table.text('seo_description');
      table.timestamp('date_updated', { useTz: true });
    });
  }

  if (!(await knex.schema.hasTable('contact_requests'))) {
    await knex.schema.createTable('contact_requests', (table) => {
      table.increments('id').primary();
      table.string('status', 20).notNullable().defaultTo('new').index();
      table.string('full_name', 255).notNullable();
      table.string('mobile', 50).notNullable();
      table.string('email', 255);
      table.string('company', 255);
      table.string('service', 255);
      table.text('message').notNullable();
      table.string('preferred_contact', 50);
      table.boolean('consent').notNullable().defaultTo(false);
      table.string('source', 80).notNullable().defaultTo('website');
      table.string('website', 255);
      table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now()).index();
    });
  }

  if (!(await knex.schema.hasTable('blog_categories'))) {
    await knex.schema.createTable('blog_categories', (table) => {
      table.increments('id').primary();
      table.integer('sort').notNullable().defaultTo(0).index();
      table.string('slug', 140).notNullable().unique();
      table.string('name', 255).notNullable();
      table.text('description');
      table.string('seo_title', 255);
      table.text('seo_description');
    });
  }

  if (!(await knex.schema.hasTable('blog_tags'))) {
    await knex.schema.createTable('blog_tags', (table) => {
      table.increments('id').primary();
      table.string('slug', 140).notNullable().unique();
      table.string('name', 255).notNullable();
    });
  }

  if (!(await knex.schema.hasTable('blog_posts'))) {
    await knex.schema.createTable('blog_posts', (table) => {
      table.increments('id').primary();
      table.string('status', 20).notNullable().defaultTo('draft').index();
      table.string('slug', 180).notNullable().unique();
      table.string('title', 255).notNullable();
      table.text('excerpt').notNullable();
      table.text('content').notNullable();
      table.uuid('cover_image').references('id').inTable('directus_files').onDelete('SET NULL');
      table.integer('category_id').references('id').inTable('blog_categories').onDelete('SET NULL');
      table.string('author_name', 255).defaultTo('Webigram');
      table.timestamp('published_at', { useTz: true }).index();
      table.integer('reading_minutes').notNullable().defaultTo(5);
      table.boolean('featured').notNullable().defaultTo(false);
      table.string('seo_title', 255);
      table.text('seo_description');
      table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('date_updated', { useTz: true });
    });
  }

  if (!(await knex.schema.hasTable('blog_posts_tags'))) {
    await knex.schema.createTable('blog_posts_tags', (table) => {
      table.increments('id').primary();
      table.integer('blog_post_id').notNullable().references('id').inTable('blog_posts').onDelete('CASCADE');
      table.integer('blog_tag_id').notNullable().references('id').inTable('blog_tags').onDelete('CASCADE');
      table.integer('sort').notNullable().defaultTo(0);
      table.unique(['blog_post_id', 'blog_tag_id']);
    });
  }

  if (!(await knex.schema.hasTable('blog_page'))) {
    await knex.schema.createTable('blog_page', (table) => {
      table.increments('id').primary();
      table.string('hero_kicker', 120);
      table.string('hero_title', 255);
      table.text('hero_description');
      table.string('seo_title', 255);
      table.text('seo_description');
      table.timestamp('date_updated', { useTz: true });
    });
  }
}

async function configurePortfolio(knex) {
  await ensureCollectionMeta(knex, 'portfolio', {
    icon: 'work', note: 'نمونه کارهای قابل نمایش در /portfolio', display_template: '{{title}}',
    archive_field: 'status', archive_value: 'archived', unarchive_value: 'draft', sort_field: 'sort',
  });
  await ensureCollectionMeta(knex, 'portfolio_gallery', { icon: 'photo_library', hidden: true, note: 'گالری تصاویر نمونه کارها.' });
  await ensureCollectionMeta(knex, 'portfolio_page', { icon: 'collections', singleton: true, note: 'متن و SEO صفحه نمونه کارها.' });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1, width: 'half' }],
    ['status', { interface: 'select-dropdown', options: statusChoices, sort: 2, width: 'half' }],
    ['sort', { interface: 'input', sort: 3, width: 'half' }],
    ['featured', { interface: 'boolean', sort: 4, width: 'half' }],
    ['slug', { interface: 'input', sort: 5, width: 'half', note: 'شناسه انگلیسی یکتا برای URL.' }],
    ['title', { interface: 'input', sort: 6 }],
    ['summary', { interface: 'input-multiline', sort: 7 }],
    ['description', { interface: 'input-rich-text-html', sort: 8 }],
    ['client', { interface: 'input', sort: 9, width: 'half' }],
    ['year', { interface: 'input', sort: 10, width: 'half' }],
    ['service', { interface: 'input', sort: 11, width: 'half' }],
    ['project_url', { interface: 'input', sort: 12, width: 'half' }],
    ['technologies', { interface: 'tags', special: 'cast-json', sort: 13 }],
    ['cover_image', { interface: 'file', special: 'file', options: { folder: PORTFOLIO_FOLDER_ID }, sort: 14 }],
    ['gallery', { interface: 'files', special: 'files', options: { folder: PORTFOLIO_FOLDER_ID }, sort: 15, note: 'چند تصویر انتخاب کنید و با drag & drop مرتب کنید.' }],
    ['seo_title', { interface: 'input', sort: 16 }],
    ['seo_description', { interface: 'input-multiline', sort: 17 }],
    ['date_created', { interface: 'datetime', special: 'date-created', readonly: true, sort: 18, width: 'half' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 19, width: 'half' }],
  ];
  for (const [field, meta] of fields) await ensureFieldMeta(knex, 'portfolio', field, meta);

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['portfolio_id', { hidden: true }],
    ['directus_files_id', { hidden: true }],
    ['sort', { interface: 'input', hidden: true }],
  ]) await ensureFieldMeta(knex, 'portfolio_gallery', field, meta);

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['hero_kicker', { interface: 'input', sort: 2 }],
    ['hero_title', { interface: 'input', sort: 3 }],
    ['hero_description', { interface: 'input-multiline', sort: 4 }],
    ['seo_title', { interface: 'input', sort: 5 }],
    ['seo_description', { interface: 'input-multiline', sort: 6 }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 7 }],
  ]) await ensureFieldMeta(knex, 'portfolio_page', field, meta);

  await ensureRelationMeta(knex, 'portfolio', 'cover_image', 'directus_files');
  await ensureRelationMeta(knex, 'portfolio_gallery', 'portfolio_id', 'portfolio', {
    one_field: 'gallery', junction_field: 'directus_files_id', sort_field: 'sort', one_deselect_action: 'delete',
  });
  await ensureRelationMeta(knex, 'portfolio_gallery', 'directus_files_id', 'directus_files', {
    junction_field: 'portfolio_id', one_deselect_action: 'delete',
  });

  await ensurePermission(knex, 'portfolio', 'read', 'id,sort,slug,title,summary,description,client,year,service,technologies,cover_image,gallery,featured,project_url,seo_title,seo_description,date_updated', {
    permissions: { status: { _eq: 'published' } },
  });
  await ensurePermission(knex, 'portfolio_gallery', 'read', 'id,portfolio_id,directus_files_id,sort');
  await ensurePermission(knex, 'portfolio_page', 'read', 'id,hero_kicker,hero_title,hero_description,seo_title,seo_description,date_updated');
}

async function configureContact(knex) {
  await ensureCollectionMeta(knex, 'contact_requests', {
    icon: 'contact_phone', note: 'درخواست های تماس ثبت شده از سایت. حاوی اطلاعات شخصی؛ دسترسی Public فقط Create است.',
    display_template: '{{full_name}} - {{mobile}}', archive_field: 'status', archive_value: 'closed', unarchive_value: 'new',
  });

  const fields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1 }],
    ['status', { interface: 'select-dropdown', options: contactStatusChoices, sort: 2, width: 'half' }],
    ['date_created', { interface: 'datetime', special: 'date-created', readonly: true, sort: 3, width: 'half' }],
    ['full_name', { interface: 'input', sort: 4, width: 'half' }],
    ['mobile', { interface: 'input', sort: 5, width: 'half' }],
    ['email', { interface: 'input', sort: 6, width: 'half' }],
    ['company', { interface: 'input', sort: 7, width: 'half' }],
    ['service', { interface: 'input', sort: 8, width: 'half' }],
    ['preferred_contact', { interface: 'select-dropdown', options: { choices: [
      { text: 'تماس تلفنی', value: 'phone' }, { text: 'واتساپ', value: 'whatsapp' }, { text: 'ایمیل', value: 'email' },
    ] }, sort: 9, width: 'half' }],
    ['message', { interface: 'input-multiline', sort: 10 }],
    ['consent', { interface: 'boolean', sort: 11, width: 'half' }],
    ['source', { interface: 'input', readonly: true, sort: 12, width: 'half' }],
    ['website', { interface: 'input', hidden: true, sort: 13, note: 'Honeypot ضد اسپم.' }],
  ];
  for (const [field, meta] of fields) await ensureFieldMeta(knex, 'contact_requests', field, meta);

  await ensurePermission(knex, 'contact_requests', 'create', 'full_name,mobile,email,company,service,message,preferred_contact,consent,website', {
    validation: {
      _and: [
        { full_name: { _nempty: true } },
        { mobile: { _nempty: true } },
        { message: { _nempty: true } },
        { consent: { _eq: true } },
        { website: { _empty: true } },
      ],
    },
    presets: { status: 'new', source: 'website' },
  });
}

async function configureBlog(knex) {
  await ensureCollectionMeta(knex, 'blog_categories', { icon: 'category', note: 'دسته بندی مطالب بلاگ.', display_template: '{{name}}', sort_field: 'sort' });
  await ensureCollectionMeta(knex, 'blog_tags', { icon: 'sell', note: 'تگ های مطالب بلاگ.', display_template: '{{name}}' });
  await ensureCollectionMeta(knex, 'blog_posts', {
    icon: 'article', note: 'مطالب بلاگ وبیگرام.', display_template: '{{title}}',
    archive_field: 'status', archive_value: 'archived', unarchive_value: 'draft',
  });
  await ensureCollectionMeta(knex, 'blog_posts_tags', { icon: 'link', hidden: true, note: 'رابط مطلب و تگ.' });
  await ensureCollectionMeta(knex, 'blog_page', { icon: 'newspaper', singleton: true, note: 'متن و SEO صفحه بلاگ.' });

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['sort', { interface: 'input', sort: 2, width: 'half' }],
    ['slug', { interface: 'input', sort: 3, width: 'half' }],
    ['name', { interface: 'input', sort: 4 }],
    ['description', { interface: 'input-multiline', sort: 5 }],
    ['seo_title', { interface: 'input', sort: 6 }],
    ['seo_description', { interface: 'input-multiline', sort: 7 }],
  ]) await ensureFieldMeta(knex, 'blog_categories', field, meta);

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['slug', { interface: 'input', sort: 2, width: 'half' }],
    ['name', { interface: 'input', sort: 3, width: 'half' }],
    ['posts', { interface: 'list-m2m', special: 'm2m', hidden: true }],
  ]) await ensureFieldMeta(knex, 'blog_tags', field, meta);

  const postFields = [
    ['id', { interface: 'input', readonly: true, hidden: true, sort: 1 }],
    ['status', { interface: 'select-dropdown', options: statusChoices, sort: 2, width: 'half' }],
    ['featured', { interface: 'boolean', sort: 3, width: 'half' }],
    ['slug', { interface: 'input', sort: 4, width: 'half' }],
    ['published_at', { interface: 'datetime', sort: 5, width: 'half' }],
    ['title', { interface: 'input', sort: 6 }],
    ['excerpt', { interface: 'input-multiline', sort: 7 }],
    ['content', { interface: 'input-rich-text-html', sort: 8 }],
    ['cover_image', { interface: 'file', special: 'file', options: { folder: BLOG_FOLDER_ID }, sort: 9 }],
    ['category_id', { interface: 'select-dropdown-m2o', sort: 10, width: 'half' }],
    ['author_name', { interface: 'input', sort: 11, width: 'half' }],
    ['reading_minutes', { interface: 'input', sort: 12, width: 'half' }],
    ['tags', { interface: 'list-m2m', special: 'm2m', sort: 13 }],
    ['seo_title', { interface: 'input', sort: 14 }],
    ['seo_description', { interface: 'input-multiline', sort: 15 }],
    ['date_created', { interface: 'datetime', special: 'date-created', readonly: true, sort: 16, width: 'half' }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 17, width: 'half' }],
  ];
  for (const [field, meta] of postFields) await ensureFieldMeta(knex, 'blog_posts', field, meta);

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['blog_post_id', { hidden: true }],
    ['blog_tag_id', { hidden: true }],
    ['sort', { interface: 'input', hidden: true }],
  ]) await ensureFieldMeta(knex, 'blog_posts_tags', field, meta);

  for (const [field, meta] of [
    ['id', { interface: 'input', readonly: true, hidden: true }],
    ['hero_kicker', { interface: 'input', sort: 2 }],
    ['hero_title', { interface: 'input', sort: 3 }],
    ['hero_description', { interface: 'input-multiline', sort: 4 }],
    ['seo_title', { interface: 'input', sort: 5 }],
    ['seo_description', { interface: 'input-multiline', sort: 6 }],
    ['date_updated', { interface: 'datetime', special: 'date-updated', readonly: true, sort: 7 }],
  ]) await ensureFieldMeta(knex, 'blog_page', field, meta);

  await ensureRelationMeta(knex, 'blog_posts', 'cover_image', 'directus_files');
  await ensureRelationMeta(knex, 'blog_posts', 'category_id', 'blog_categories');
  await ensureRelationMeta(knex, 'blog_posts_tags', 'blog_post_id', 'blog_posts', {
    one_field: 'tags', junction_field: 'blog_tag_id', sort_field: 'sort', one_deselect_action: 'delete',
  });
  await ensureRelationMeta(knex, 'blog_posts_tags', 'blog_tag_id', 'blog_tags', {
    one_field: 'posts', junction_field: 'blog_post_id', one_deselect_action: 'delete',
  });

  await ensurePermission(knex, 'blog_categories', 'read', 'id,sort,slug,name,description,seo_title,seo_description');
  await ensurePermission(knex, 'blog_tags', 'read', 'id,slug,name');
  await ensurePermission(knex, 'blog_posts', 'read', 'id,slug,title,excerpt,content,cover_image,category_id,author_name,published_at,reading_minutes,featured,seo_title,seo_description,date_updated,tags', {
    permissions: { status: { _eq: 'published' } },
  });
  await ensurePermission(knex, 'blog_posts_tags', 'read', 'id,blog_post_id,blog_tag_id,sort');
  await ensurePermission(knex, 'blog_page', 'read', 'id,hero_kicker,hero_title,hero_description,seo_title,seo_description,date_updated');
}

async function configurePublicFiles(knex) {
  await ensurePermission(knex, 'directus_files', 'read', 'id,folder,filename_download,title,description,type,width,height', {
    permissions: { folder: { _in: [PORTFOLIO_FOLDER_ID, BLOG_FOLDER_ID] } },
  });
}

async function seedPages(knex) {
  const [{ count: portfolioPageCount }] = await knex('portfolio_page').count('* as count');
  if (Number(portfolioPageCount) === 0) {
    await knex('portfolio_page').insert({
      id: 1,
      hero_kicker: 'نمونه کارهای وبیگرام',
      hero_title: 'چیزهایی که ساختیم، نه فقط چیزهایی که گفتیم.',
      hero_description: 'پروژه هایی از زیرساخت و اتوماسیون تا پنل سازمانی، پلتفرم و وب. هر پروژه یک مسئله واقعی داشته و راه حل متناسب خودش را.',
      seo_title: 'نمونه کارهای وبیگرام | پروژه های نرم افزار، DevOps و اتوماسیون',
      seo_description: 'نمونه پروژه های وبیگرام در حوزه DevOps، اتوماسیون، طراحی پلتفرم، پنل سازمانی و توسعه وب.',
    });
  }

  const [{ count: blogPageCount }] = await knex('blog_page').count('* as count');
  if (Number(blogPageCount) === 0) {
    await knex('blog_page').insert({
      id: 1,
      hero_kicker: 'بلاگ وبیگرام',
      hero_title: 'یادداشت هایی از دل ساختن و حل مسئله.',
      hero_description: 'تجربه های فنی، معماری، DevOps، اتوماسیون، هوش مصنوعی و ساخت محصولات دیجیتال؛ بدون پر کردن صفحه برای سئو.',
      seo_title: 'بلاگ وبیگرام | DevOps، اتوماسیون، AI و توسعه نرم افزار',
      seo_description: 'مقالات وبیگرام درباره DevOps، اتوماسیون، هوش مصنوعی، توسعه نرم افزار و ساخت محصولات دیجیتال.',
    });
  }
}

export async function up(knex) {
  await ensureFolder(knex, PORTFOLIO_FOLDER_ID, 'Webigram - Portfolio');
  await ensureFolder(knex, BLOG_FOLDER_ID, 'Webigram - Blog');
  await createTables(knex);
  await configurePortfolio(knex);
  await configureContact(knex);
  await configureBlog(knex);
  await configurePublicFiles(knex);
  await seedPages(knex);
}

export async function down(knex) {
  const collections = ['portfolio', 'portfolio_gallery', 'portfolio_page', 'contact_requests', 'blog_posts', 'blog_categories', 'blog_tags', 'blog_posts_tags', 'blog_page'];
  await knex('directus_permissions').whereIn('collection', collections).delete();
  await knex('directus_relations').whereIn('many_collection', ['portfolio', 'portfolio_gallery', 'blog_posts', 'blog_posts_tags']).delete();
  await knex('directus_fields').whereIn('collection', collections).delete();
  await knex('directus_collections').whereIn('collection', collections).delete();

  await knex.schema.dropTableIfExists('blog_posts_tags');
  await knex.schema.dropTableIfExists('blog_posts');
  await knex.schema.dropTableIfExists('blog_tags');
  await knex.schema.dropTableIfExists('blog_categories');
  await knex.schema.dropTableIfExists('blog_page');
  await knex.schema.dropTableIfExists('contact_requests');
  await knex.schema.dropTableIfExists('portfolio_gallery');
  await knex.schema.dropTableIfExists('portfolio');
  await knex.schema.dropTableIfExists('portfolio_page');

  await knex('directus_folders').whereIn('id', [PORTFOLIO_FOLDER_ID, BLOG_FOLDER_ID]).delete();
}
