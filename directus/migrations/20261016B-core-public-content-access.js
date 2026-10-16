const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

/**
 * Directus 12 Core ignores custom permission rules. A permission becomes
 * "custom" when it limits fields or applies an item filter. The public CMS
 * permissions created before the v12 licensing change therefore resolve to
 * zero permissions even though the rows still exist in PostgreSQL.
 *
 * These Webigram collections currently contain only public website content.
 * Give the Public policy flat read access so Core can serve them again.
 * The frontend still explicitly requests status=published for collections
 * that have a publication status, preventing drafts from being rendered.
 *
 * Do not add directus_files here: unrestricted file access would make every
 * uploaded file public. Media should get a dedicated public delivery design
 * before CMS-managed images are introduced.
 */

async function flatPublicRead(knex, collection) {
  if (!(await knex.schema.hasTable(collection))) return;

  const payload = {
    fields: '*',
    permissions: null,
    validation: null,
    presets: null,
  };

  const existing = await knex('directus_permissions')
    .where({ policy: PUBLIC_POLICY_ID, collection, action: 'read' })
    .first();

  if (existing) {
    await knex('directus_permissions')
      .where({ id: existing.id })
      .update(payload);
    return;
  }

  await knex('directus_permissions').insert({
    policy: PUBLIC_POLICY_ID,
    collection,
    action: 'read',
    ...payload,
  });
}

export async function up(knex) {
  const collections = [
    'services',
    'services_page',
    'portfolio',
    'portfolio_page',
    'portfolio_gallery',
    'blog_posts',
    'blog_categories',
    'blog_tags',
    'blog_posts_tags',
    'blog_page',
  ];

  for (const collection of collections) {
    await flatPublicRead(knex, collection);
  }
}

export async function down() {
  // Intentionally no-op. Reverting to the old custom permission rows on a
  // Core-tier Directus 12 instance would immediately break the public API.
}
