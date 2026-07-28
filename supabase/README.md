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

Apply `migrations/202607270001_admin_user_directory.sql` to add the read-only
administrator user directory at `/admin/users/`. The protected RPC returns only
confirmed accounts that have completed at least one sign-in. Owners and
delegated administrators can search all signed-in accounts or filter to
approved instructors. The browser never receives direct access to
`auth.users`, and anonymous callers cannot execute the directory function.

Apply `migrations/202607230001_publisher_review_entitlements.sql` to add
time-limited publisher-review access and the dormant verified-book-owner role.
Administrators manage publisher reviewers at `/admin/access/`; reviewers use
`/publisher-review/`. The invited account must first sign in and verify its
exact email. Grants and revocations are written to the administrator audit log.

Publisher reviewers may inspect the portal and browser-based online manual.
They cannot download the manual PDF, use instructor resources or discussions,
open the private AE repository, or enter administrator pages. The database
refuses all `book_owner` grants until a future migration enables that role
after written publisher permission.

Apply `migrations/202607240001_publisher_review_ae_examples.sql` to create the
RLS-protected table for three complete publisher-review examples. Then generate
the private content ingestion SQL from the ignored `AE-notebooks` repository:

```bash
npm run publisher-examples:build
```

Run `.private-build/publisher-ae-examples.sql` in the Supabase SQL Editor. This
loads AE 7.5.5 (SVM bearing-fault classification), AE 9.5.2 (CNN surface-defect
detection), and AE 12.3.5 (VAE sensor-anomaly detection), including code and
executed outputs. The generated SQL and notebook content remain ignored by Git
and never enter the public Pages artifact. Reviewers open them from
`/publisher-review/application-examples/`.

Apply `migrations/202607240002_protected_ae_delivery.sql` to install the
dormant protected-notebook delivery boundary. It creates a private
`ae-notebooks` Storage bucket with no client read policies, notebook metadata,
an acknowledgment and delivery audit, separate Colab and download capability
switches, and the authorization RPC used by the delivery Edge Function. The
bucket is retained for migration compatibility but is not the notebook source.

The migration leaves both delivery switches off. It cannot enable either
switch without a written publisher-permission reference, and the earlier
migration still refuses all `book_owner` grants. This lets the workflow be
reviewed without distributing any notebook.

Apply `migrations/202607240005_private_github_ae_source.sql` after the review
test migration. It stores only each validated notebook's repository-relative
path in Supabase. The private `ml4ea/ae-notebooks` repository remains the
single source of notebook files.

Create a fine-grained GitHub personal access token owned by `ml4ea`, restricted
to only the `ae-notebooks` repository, with only **Contents: Read-only**
permission. Save it as the Supabase Edge Function secret `GITHUB_AE_TOKEN`.
Never add this token to Portal, GitHub Pages variables, client JavaScript, or a
database row.

Deploy the `deliver-ae-notebook` Edge Function. It verifies the signed-in user,
records the selected action and notice version, fetches the authorized file
from the private GitHub repository, verifies its SHA-256 checksum, and returns
the notebook content to the authorized browser. The GitHub token and automatic
service-role key remain server-side Edge Function secrets.

For future Google Colab activation, create a Google OAuth web client restricted
to the portal origin and add its public client ID as
`PUBLIC_GOOGLE_DRIVE_CLIENT_ID` in GitHub Actions variables. The browser asks
only for `drive.file`, creates an app-managed `ML4EA` folder when needed,
uploads or updates the authorized notebook, and opens that Drive file in
Colab. The portal does not store the Google access token.

Apply `migrations/202607240003_publisher_review_ae_delivery_test.sql` to enable
the real Colab and local-download workflow only for the permanent portal owner
and active publisher reviewers. This review-test path records the same
acknowledgment and delivery audit as the future distribution workflow, but it
does not activate the dormant `book_owner` role or the production delivery
switches that require written publisher permission.

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
- Only active publisher reviewers and administrators can query the three
  selected full AE previews. Their HTML is sanitized before browser rendering.
- The remaining AE notebooks and private repository are not exposed.
- Protected AE delivery retrieves validated files from the private GitHub
  repository with a server-only, repository-scoped, read-only credential.
- Verified-book-owner activation remains blocked during prelaunch.
- AE delivery has independent Colab and local-download switches; both are off
  until the permanent owner records a written publisher-permission reference.
- The AE Storage bucket has no authenticated client read policy. A verified
  book owner receives only a 60-second URL after acknowledging the current
  notice, and the action is recorded by user, notebook hash, and version.
- Public discussion reads expose display names but not account email addresses
  or authentication user IDs.
- Instructor-only discussion categories are enforced by RLS rather than by
  client-side hiding.
- Manual HTML is sanitized in the browser before rendering or inclusion in an
  exported editable document.

Run `npm run build` followed by `npm run security:audit` to verify the static
artifact and anonymous live API boundaries. The GitHub Pages workflow runs the
same audit before deployment.
