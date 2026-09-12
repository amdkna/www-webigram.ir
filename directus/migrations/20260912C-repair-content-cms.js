import { up as applyContentCms } from './20260912B-portfolio-contact-blog.js';

/**
 * Repair migration for environments where the migration file was mounted
 * after the Directus container had already booted. The imported migration is
 * intentionally idempotent: tables, metadata, relations, permissions, folders
 * and page seed rows are created only when they are missing.
 */
export async function up(knex) {
  await applyContentCms(knex);
}

// Do not remove content/schema in a repair rollback. The original migration
// remains the owner of the corresponding down migration.
export async function down() {}
