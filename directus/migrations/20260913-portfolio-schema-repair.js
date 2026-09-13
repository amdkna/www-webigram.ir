async function addColumnIfMissing(knex, tableName, columnName, defineColumn) {
  const exists = await knex.schema.hasColumn(tableName, columnName);
  if (exists) return;

  await knex.schema.alterTable(tableName, (table) => {
    defineColumn(table);
  });
}

export async function up(knex) {
  const exists = await knex.schema.hasTable('portfolio');
  if (!exists) return;

  // The portfolio collection existed before the richer Case Study fields were
  // introduced. Directus therefore skipped createTable() in the next migration
  // and the seed step crashed because these columns were missing. Repair the
  // physical PostgreSQL schema first so 20260913A can safely configure metadata
  // and seed the initial portfolio content.
  await addColumnIfMissing(knex, 'portfolio', 'client', (table) => table.string('client', 255));
  await addColumnIfMissing(knex, 'portfolio', 'year', (table) => table.string('year', 40));
  await addColumnIfMissing(knex, 'portfolio', 'service', (table) => table.string('service', 160));
  await addColumnIfMissing(knex, 'portfolio', 'duration', (table) => table.string('duration', 160));
  await addColumnIfMissing(knex, 'portfolio', 'client_request', (table) => table.text('client_request'));
  await addColumnIfMissing(knex, 'portfolio', 'approach', (table) => table.text('approach'));
  await addColumnIfMissing(knex, 'portfolio', 'outcome', (table) => table.text('outcome'));
  await addColumnIfMissing(knex, 'portfolio', 'technologies', (table) =>
    table.jsonb('technologies').notNullable().defaultTo(knex.raw("'[]'::jsonb")),
  );
  await addColumnIfMissing(knex, 'portfolio', 'featured', (table) =>
    table.boolean('featured').notNullable().defaultTo(false),
  );
  await addColumnIfMissing(knex, 'portfolio', 'cover_image', (table) =>
    table.uuid('cover_image').nullable().references('id').inTable('directus_files').onDelete('SET NULL'),
  );
  await addColumnIfMissing(knex, 'portfolio', 'project_url', (table) => table.string('project_url', 500));
  await addColumnIfMissing(knex, 'portfolio', 'seo_title', (table) => table.string('seo_title', 255));
  await addColumnIfMissing(knex, 'portfolio', 'seo_description', (table) => table.text('seo_description'));
  await addColumnIfMissing(knex, 'portfolio', 'date_created', (table) =>
    table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now()),
  );
  await addColumnIfMissing(knex, 'portfolio', 'date_updated', (table) =>
    table.timestamp('date_updated', { useTz: true }),
  );
}

export async function down() {
  // Intentionally no-op. This is a compatibility repair for an existing
  // production collection; removing the columns would risk user content.
}
