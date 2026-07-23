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

Keep email OTP authentication enabled. A successful email-code sign-in proves
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

## 4. Assign the portal administrator

Apply `migrations/202607220003_single_portal_administrator.sql` after the base
instructor-access migration. It removes any other administrator assignments,
assigns `yjin@usc.edu`, limits the administrator table to one row, and makes the
administrator check require that exact verified account email.

The administrator dashboard is `/admin/`. It summarizes pending instructor
requests and open discussion reports, then links to the protected review
workspaces. Administrator membership cannot be assigned through the public
client.

Apply `migrations/202607220004_delegated_portal_administrator.sql` to allow the
permanent owner to appoint one alternate administrator from
`/admin/delegation/`. The delegate must sign in and verify the account email
before appointment. Delegates can complete operational reviews and moderation,
but only `yjin@usc.edu` can appoint, replace, or revoke a delegate. Appointment
and revocation events are recorded in the protected administrator audit log.

Apply `migrations/202607230001_publisher_review_entitlements.sql` to add
time-limited publisher-review access and the dormant verified-book-owner role.
Administrators manage publisher reviewers at `/admin/access/`; reviewers use
`/publisher-review/`. The invited account must first sign in and verify its
exact email. Grants and revocations are written to the administrator audit log.

Publisher reviewers may inspect the portal and browser-based online manual.
They cannot download the manual PDF, use instructor resources or discussions,
open AE notebook files, or enter administrator pages. The database refuses all
`book_owner` grants until a future migration enables that role after written
publisher permission.

Deploy the `notify-instructor-decision` Edge Function with the existing SMTP
secrets. Set `ML4EA_ADMIN_EMAIL` to `ml4ea.book@gmail.com`; the function also
uses that address as its built-in fallback. New submissions notify the
administrator, while approval and rejection decisions notify the applicant.

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

For a reviewed community teaching resource, use the category
`Community contribution`. Published records in that category appear in the
protected `/instructor/contributions/` collection.

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

## 7. Enable community discussions

Apply `migrations/202607220002_discussions.sql` after the instructor-access
migration. It creates public discussion categories, threads, replies, reports,
posting RPCs, rate limits, and Row Level Security policies.

Public discussions are readable without an account. A verified email account
is required to post or report content. The Teaching Practice category is
visible only to approved instructors and portal administrators. Posts are
stored as plain text; HTML from participants is never rendered.

## Security boundaries

- Public pages and the Application Example catalog do not require an account.
- Application Example notebook files and repository access remain private
  during prelaunch publisher review.
- Personal email providers are screened out during instructor application.
- Institutional email is necessary but not sufficient; an administrator must
  verify the public institutional profile and teaching role.
- Applicants cannot set or change approval fields directly.
- Only `yjin@usc.edu` or the single owner-appointed delegate can approve or
  reject an instructor request. Only `yjin@usc.edu` can manage delegation.
- Only approved instructors and portal administrators can read published
  resource metadata or download objects.
- Signed download URLs expire after 60 seconds.
- Manual edition rows, section HTML, and search results are restricted to
  approved instructors, administrators, and active publisher reviewers.
- The manual PDF and other private Storage objects remain restricted to
  approved instructors and administrators; publisher review is online-only.
- Publisher-review grants require exact verified-email matching, expire
  automatically, can be revoked immediately, and are audited.
- Verified-book-owner activation remains blocked during prelaunch.
- Public discussion reads expose display names but not account email addresses
  or authentication user IDs.
- Instructor-only discussion categories are enforced by RLS rather than by
  client-side hiding.
- Manual HTML is sanitized in the browser before rendering or inclusion in an
  exported editable document.

Run `npm run build` followed by `npm run security:audit` to verify the static
artifact and anonymous live API boundaries. The GitHub Pages workflow runs the
same audit before deployment.
