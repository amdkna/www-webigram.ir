// Production repair for anonymous Services API access.
const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

async function upsertPublicRead(knex, collection, fields, permissions = null) {
  const publicPolicy = await knex('directus_policies')
    .where({ id: PUBLIC_POLICY_ID })
    .first();

  if (!publicPolicy) {
    throw new Error(`Directus public policy ${PUBLIC_POLICY_ID} was not found`);
  }

  const where = {
    policy: PUBLIC_POLICY_ID,
    collection,
    action: 'read',
  };

  const payload = {
    permissions: permissions ? JSON.stringify(permissions) : null,
    validation: null,
    presets: null,
    fields,
  };

  const existing = await knex('directus_permissions').where(where).first();

  if (existing) {
    await knex('directus_permissions').where(where).update(payload);
    return;
  }

  await knex('directus_permissions').insert({
    ...where,
    ...payload,
  });
}

export async function up(knex) {
  await upsertPublicRead(
    knex,
    'services',
    'id,sort,slug,title,summary,details,icon,tags,featured,cta_label,cta_url,seo_title,seo_description,date_updated',
    { status: { _eq: 'published' } },
  );

  await upsertPublicRead(
    knex,
    'services_page',
    'id,hero_kicker,hero_title_before,hero_title_highlight,hero_title_after,hero_description,cta_kicker,cta_title,cta_description,cta_button_label,cta_button_url,seo_title,seo_description,date_updated',
  );
}

export async function down() {
  // Intentionally no-op. This is a production permission repair; removing these
  // reads would break the public Services page again.
}
