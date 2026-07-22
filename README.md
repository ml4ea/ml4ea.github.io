# ML4EA Companion Portal

The companion portal for *Machine Learning for Engineering Applications*.

## Development

```bash
npm install
npm run dev
```

The production build is generated with `npm run build` and deployed to GitHub Pages through `.github/workflows/deploy.yml`.

## Public resources

- The book, author, chapter, learning, teaching, community, updates, and errata pages are public.
- The Application Examples page indexes 56 notebooks with direct GitHub and Google Colab access.
- Corrections and resource contributions use structured GitHub forms until portal accounts and discussions are introduced.
- Supabase email-link authentication and reviewed instructor applications protect instructor-only resources.
- The instructor manual remains outside the public repository and is delivered from a private Storage bucket using short-lived signed URLs.

See [`supabase/README.md`](supabase/README.md) for database, authentication,
administrator, deployment-variable, and protected-resource setup.

Book and instructor-manual source materials live outside this repository and are not modified by portal development.
