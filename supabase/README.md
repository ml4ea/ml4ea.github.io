# Supabase Setup for ML4EA Pass 4

The portal uses Supabase Auth, PostgreSQL Row Level Security, and a private
Storage bucket for verified instructor access. The book and instructor manual
remain outside the public Portal repository.

## 1. Apply the database migration

In the Supabase SQL Editor, run
`migrations/202607210001_instructor_access.sql`. The migration creates profiles,
instructor applications, administrator assignments, protected-resource
metadata, RPC functions, RLS policies, and the private `instructor-materials`
bucket.

The project-level "automatic RLS" option may remain enabled. This migration
also enables RLS explicitly on every application table.

## 2. Configure authentication URLs

In Authentication > URL Configuration, use:

- Site URL: `https://ml4ea.github.io`
- Redirect URL: `https://ml4ea.github.io/**`
- Local redirect URL: `http://127.0.0.1:4321/**`

Keep email-link authentication enabled. A successful email-link sign-in proves
control of the address; it does not by itself grant instructor access.

## 3. Configure portal build variables

Copy `.env.example` to `.env` for local development and fill in the project URL
and publishable key. Both values are designed to be public; authorization is
enforced by RLS.

For GitHub Pages, add these repository variables under Settings > Secrets and
variables > Actions > Variables:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never add a Supabase secret key or service-role key to the portal, GitHub Pages,
client JavaScript, or a `PUBLIC_` environment variable.

## 4. Assign the first portal administrator

Sign in once through `/account`, then run this statement in the SQL Editor with
your verified account email:

```sql
insert into public.portal_admins (user_id)
select id from auth.users where lower(email) = lower('YOUR_EMAIL_HERE')
on conflict (user_id) do nothing;
```

The review workspace is `/admin/instructors`. Administrator membership cannot
be assigned through the public client.

## 5. Publish a protected resource

Upload a file through the Supabase dashboard to the private
`instructor-materials` bucket. Do not copy the instructor manual into Portal.
Then create its metadata record:

```sql
insert into public.instructor_resources
  (title, description, category, storage_path, sort_order, published)
values
  ('Instructor''s Manual',
   'Course design, teaching guidance, and chapter-by-chapter notes.',
   'Manual',
   'manual/ml4ea-instructors-manual.pdf',
   10,
   true);
```

Approved instructors receive a short-lived signed URL. The bucket remains
private, and direct public object URLs do not work.

## 6. Publish the protected online manual

Apply `migrations/202607220001_online_instructor_manual.sql` after the base
instructor-access migration. It creates the protected edition and section
tables, full-text search RPC, and RLS policies.

Generate the online edition from the finalized sibling `Manual` directory:

```bash
python3 tools/build_manual_web.py \
  --source ../Manual \
  --output .private-build/manual.json \
  --sql-output .private-build/manual-content.sql
```

Run `.private-build/manual-content.sql` in the Supabase SQL Editor, then upload
the current PDF to the private `instructor-materials` bucket at:

```text
manual/ML4EA-Instructors-Manual-2026-07.pdf
```

The generated JSON, ingestion SQL, and manual PDF are private deployment
artifacts ignored by Git. The public portal contains only the reader shell;
section content is fetched after Supabase verifies the signed-in account as an
approved instructor.

## Security boundaries

- Public pages and Application Example notebooks do not require an account.
- Personal email providers are screened out during instructor application.
- Institutional email is necessary but not sufficient; an administrator must
  verify the public institutional profile and teaching role.
- Applicants cannot set or change approval fields directly.
- Only approved instructors and portal administrators can read published
  resource metadata or download objects.
- Signed download URLs expire after 60 seconds.
- Manual edition rows, section HTML, search results, and the PDF are all
  restricted by approved-instructor RLS checks.
