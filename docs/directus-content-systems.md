# Webigram content systems in Directus

This project manages the public services, portfolio, contact requests, and blog through Directus at `cms.webigram.ir`.

## Portfolio

Collections:
- `portfolio`: one item per project/case study.
- `portfolio_gallery`: hidden junction used by the native Directus **Files** interface.
- `portfolio_page`: singleton for `/portfolio` hero text and SEO.

A portfolio item supports a cover image plus any number of gallery images. Upload portfolio images through the fields on the portfolio item; Directus stores them in the dedicated `Webigram - Portfolio` folder. Only `published` portfolio items are publicly readable.

Public routes:
- `/portfolio/`
- `/portfolio/<slug>/`

## Contact requests

Collection: `contact_requests`.

The public role has **create only** permission. It has no public read/update/delete permission. Public submissions can set only the form fields. `status=new` and `source=website` are applied as server-side Directus presets. A honeypot field is validated as empty.

Public route: `/contact/`.

## Blog

Collections:
- `blog_posts`
- `blog_categories`
- `blog_tags`
- `blog_posts_tags`: hidden M2M junction
- `blog_page`: singleton for `/blog` hero text and SEO

Posts support rich HTML content, cover image, one category, multiple tags, author, publish date, reading time, featured state, and SEO fields. Only `published` posts are publicly readable.

Public routes:
- `/blog/`
- `/blog/<slug>/`

## Files and security

Portfolio and blog uploads use two dedicated Directus folders. The public file permission is restricted to those folder IDs and a small set of safe file metadata fields. Contact requests are never publicly readable.

## Migration

Schema is created by:

`directus/migrations/20260912B-portfolio-contact-blog.js`
