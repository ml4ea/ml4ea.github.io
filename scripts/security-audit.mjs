import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDirectory = path.join(root, 'dist');
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function auditStaticBuild() {
  check(fs.existsSync(distDirectory), 'dist/ is missing; run the production build first.');
  if (!fs.existsSync(distDirectory)) return;

  const files = walk(distDirectory);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const protectedExtensions = new Set(['.doc', '.docx', '.ipynb', '.pdf', '.pptx', '.tex', '.xlsx', '.zip']);
  const forbiddenText = [
    'github.com/ml4ea/ae-notebooks',
    'colab.research.google.com/github/ml4ea/ae-notebooks',
    '"notebook_license":"MIT"',
    'service_role',
    'feature_time_48k_2048_load_1.csv',
    'layers.Conv2D(64, 3, padding="same"',
    'class VAE(nn.Module)',
  ];

  check(htmlFiles.length > 0, 'No generated HTML pages were found.');
  check(!files.some((file) => protectedExtensions.has(path.extname(file).toLowerCase())), 'A protected document or notebook type was emitted into dist/.');
  check(!files.some((file) => path.basename(file).toLowerCase().includes('sitemap')), 'A sitemap was emitted during prelaunch.');

  const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  check(!trackedFiles.some((file) => protectedExtensions.has(path.extname(file).toLowerCase())), 'A protected document or notebook type is tracked in the Portal repository.');
  check(!trackedFiles.some((file) => path.basename(file) === '.env'), 'A local environment file is tracked in the Portal repository.');

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    check(html.includes('noindex, nofollow, noarchive'), `${path.relative(root, file)} is missing the prelaunch robots directive.`);
    check(html.includes('Prelaunch preview'), `${path.relative(root, file)} is missing the prelaunch notice.`);
    check(html.includes('strict-origin-when-cross-origin'), `${path.relative(root, file)} is missing the referrer policy.`);
    check(html.includes('Content-Security-Policy'), `${path.relative(root, file)} is missing the Content Security Policy.`);
    check(html.includes("object-src 'none'"), `${path.relative(root, file)} does not block embedded objects.`);
  }

  for (const file of files.filter((candidate) => /\.(css|html|js|json|txt)$/i.test(candidate))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenText) {
      check(!content.includes(pattern), `${path.relative(root, file)} contains forbidden prelaunch text: ${pattern}`);
    }
  }
}

function auditAccessMigration() {
  const migrationPath = path.join(root, 'supabase/migrations/202607230001_publisher_review_entitlements.sql');
  check(fs.existsSync(migrationPath), 'The publisher-review entitlement migration is missing.');
  if (!fs.existsSync(migrationPath)) return;

  const migration = fs.readFileSync(migrationPath, 'utf8');
  check(migration.includes("v_role = 'book_owner'"), 'The migration does not explicitly block book-owner activation.');
  check(migration.includes('written publisher permission'), 'The dormant book-owner grant does not explain its permission boundary.');
  check(migration.includes("public.is_publisher_reviewer()"), 'The migration does not define publisher-review identity checks.');
  check(migration.includes("public.can_view_instructor_manual()"), 'The migration does not scope online manual preview access.');
  check(!migration.includes("bucket_id = 'instructor-materials'"), 'Publisher review must not modify private Storage access.');
  check(migration.includes("'entitlement_granted'"), 'Publisher-review grants are not written to the administrator audit log.');
  check(migration.includes("'entitlement_revoked'"), 'Publisher-review revocations are not written to the administrator audit log.');
}

function auditPublisherExamplesMigration() {
  const migrationPath = path.join(root, 'supabase/migrations/202607240001_publisher_review_ae_examples.sql');
  const previewMigrationPath = path.join(root, 'supabase/migrations/202607250001_signed_in_ae_browser_previews.sql');
  check(fs.existsSync(migrationPath), 'The protected publisher AE-example migration is missing.');
  check(fs.existsSync(previewMigrationPath), 'The signed-in AE browser-preview migration is missing.');
  if (!fs.existsSync(migrationPath)) return;

  const migration = fs.readFileSync(migrationPath, 'utf8');
  const previewMigration = fs.existsSync(previewMigrationPath) ? fs.readFileSync(previewMigrationPath, 'utf8') : '';
  check(migration.includes('publisher_review_ae_examples'), 'The protected publisher AE-example table is not defined.');
  check(previewMigration.includes('public.has_verified_portal_account()'), 'Selected AE browser previews are not limited to verified accounts.');
  check(previewMigration.includes('email_confirmed_at is not null'), 'AE browser preview access does not verify the signed-in email.');
  check(!migration.includes('grant select on table public.publisher_review_ae_examples to anon'), 'Anonymous users received access to selected AE examples.');
  check(!previewMigration.includes('to anon'), 'Anonymous users received access to selected AE browser previews.');

  const builderPath = path.join(root, 'tools/build_publisher_ae_examples.mjs');
  check(fs.existsSync(builderPath), 'The protected publisher AE-example builder is missing.');
  if (!fs.existsSync(builderPath)) return;
  const builder = fs.readFileSync(builderPath, 'utf8');
  for (const filename of [
    'Notebook-07.5.5-SVM-cwru-bearing.ipynb',
    'Notebook-09.5.2-CNN-NEU-DET.ipynb',
    'Notebook-12.3.5-VAE-SensorAnomaly.ipynb',
  ]) {
    check(builder.includes(filename), `The protected publisher set is missing ${filename}.`);
  }
}

async function auditAnonymousApi() {
  const localEnv = readLocalEnv();
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || localEnv.PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  check(Boolean(supabaseUrl && publishableKey), 'Supabase public variables are required for the live boundary audit.');
  if (!supabaseUrl || !publishableKey) return;

  const standardHeaders = {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    'Content-Type': 'application/json',
  };

  const request = async (endpoint, options = {}) => {
    const response = await fetch(`${supabaseUrl}${endpoint}`, {
      ...options,
      headers: { ...standardHeaders, ...options.headers },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { response, body };
  };

  const categories = await request('/rest/v1/discussion_categories?select=slug,visibility&order=sort_order');
  check(categories.response.ok, 'Anonymous public discussion categories could not be read.');
  check(Array.isArray(categories.body) && categories.body.length === 5, 'Anonymous users should see exactly five public discussion categories.');
  check(Array.isArray(categories.body) && categories.body.every((category) => category.visibility === 'public'), 'An instructor-only discussion category is visible anonymously.');

  const authorIds = await request('/rest/v1/discussion_threads?select=id,author_id&limit=1');
  check(!authorIds.response.ok, 'Anonymous users can select discussion author IDs.');

  const protectedTables = [
    'profiles',
    'portal_admins',
    'portal_admin_delegates',
    'portal_admin_audit_log',
    'portal_access_entitlements',
    'publisher_review_ae_examples',
    'instructor_applications',
    'instructor_resources',
    'instructor_manual_editions',
    'instructor_manual_sections',
    'discussion_reports',
  ];
  for (const table of protectedTables) {
    const result = await request(`/rest/v1/${table}?select=*&limit=1`);
    check(!result.response.ok, `Anonymous users can query protected table ${table}.`);
    check(result.response.status !== 404, `Protected table ${table} is missing from the live Supabase project.`);
  }

  for (const rpc of [
    'is_portal_admin',
    'is_portal_owner',
    'is_approved_instructor',
    'is_publisher_reviewer',
    'is_verified_book_owner',
    'can_view_instructor_manual',
    'get_my_portal_entitlements',
    'get_portal_access_entitlements',
  ]) {
    const result = await request(`/rest/v1/rpc/${rpc}`, { method: 'POST', body: '{}' });
    check(!result.response.ok, `Anonymous users can execute protected function ${rpc}.`);
    check(result.response.status !== 404, `Protected function ${rpc} is missing from the live Supabase project.`);
  }

  const manualSearch = await request('/rest/v1/rpc/search_instructor_manual', {
    method: 'POST',
    body: JSON.stringify({ p_query: 'course' }),
  });
  check(!manualSearch.response.ok, 'Anonymous users can search the protected instructor manual.');

  const storage = await request('/storage/v1/object/list/instructor-materials', {
    method: 'POST',
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
  });
  check(storage.response.ok && Array.isArray(storage.body) && storage.body.length === 0, 'The private instructor-materials bucket lists objects anonymously.');

  const edgeFunction = await request('/functions/v1/notify-instructor-decision', {
    method: 'POST',
    headers: { Authorization: '' },
    body: JSON.stringify({ applicationId: '00000000-0000-0000-0000-000000000000' }),
  });
  check(edgeFunction.response.status === 401, 'The instructor notification function accepts requests without a user token.');

  const notebookRepository = await fetch('https://api.github.com/repos/ml4ea/ae-notebooks', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ml4ea-security-audit' },
  });
  check(notebookRepository.status === 404, 'The AE notebook repository is visible to an anonymous GitHub user.');
}

auditAccessMigration();
auditPublisherExamplesMigration();
await auditAnonymousApi();
auditStaticBuild();

if (failures.length > 0) {
  console.error(`Security audit failed (${failures.length}/${checks} checks):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Security audit passed (${checks} checks).`);
