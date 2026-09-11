# Services content in Directus

The public `/services` page is backed by the Directus instance at `https://cms.webigram.ir`.

## Collections

### `services`

One item per service shown on the website.

Important fields:

- `status`: only `published` items are visible to anonymous visitors.
- `sort`: controls card order.
- `slug`: stable English identifier.
- `title`: service title.
- `summary`: short card copy.
- `details`: longer explanation shown below the summary.
- `icon`: short visual glyph used on the card.
- `tags`: labels such as Docker, API, Dashboard, AI.
- `featured`: adds the visual CORE marker.
- `cta_label` / `cta_url`: optional per-service action.
- `seo_title` / `seo_description`: reserved for future service detail pages.

Initial content includes:

1. DevOps and infrastructure
2. Automation and integrations
3. Platform design and development
4. Enterprise panels and dashboards
5. Websites and web applications
6. AI solutions

### `services_page`

Singleton-style collection for page-level copy:

- Hero eyebrow, title parts and description
- CTA text and link
- SEO title and description

## Deployment

`directus/migrations/20260912A-services-content.js` is mounted into the Directus container at `/directus/migrations`.
Directus 12.3.1 runs `bootstrap` when the container starts, so the migration creates/configures the collections and seeds initial content once.

The migration also creates anonymous **read-only** permissions:

- `services`: read permission is filtered to `status = published`.
- `services_page`: read only.

No public create, update, or delete permission is added.

## Frontend behavior

`src/pages/services.astro` contains a static fallback so the page still renders if the CMS is unavailable. In the browser it fetches current Directus content and replaces the fallback cards and page copy. This means normal content edits in Directus appear without rebuilding the site.
