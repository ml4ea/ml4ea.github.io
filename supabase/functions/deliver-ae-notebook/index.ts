import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ml4ea.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type DeliveryRecord = {
  audit_id: string;
  github_path: string;
  source_filename: string;
  source_sha256: string;
  notebook_version: string;
};

type NotebookAction = 'view' | 'colab' | 'download';

const sha256Hex = async (value: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const base64 = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const githubToken = Deno.env.get('GITHUB_AE_TOKEN');
  if (!supabaseUrl || !supabaseAnonKey || !githubToken) {
    return jsonResponse({ error: 'Protected notebook delivery is not configured.' }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Your session is not valid.' }, 401);

  const { slug, action, noticeVersion } = await request.json() as {
    slug?: string;
    action?: NotebookAction;
    noticeVersion?: string;
  };
  if (!slug || !action || (action !== 'view' && !noticeVersion)) {
    return jsonResponse({ error: 'Notebook, action, and any required notice acknowledgment are required.' }, 400);
  }

  const preparation = action === 'view'
    ? await userClient.rpc('prepare_ae_notebook_view', { p_slug: slug })
    : await userClient.rpc('prepare_ae_notebook_delivery', {
      p_slug: slug,
      p_action: action,
      p_notice_version: noticeVersion,
    });
  const { data, error } = preparation;
  const delivery = (data?.[0] ?? null) as DeliveryRecord | null;
  if (error || !delivery) return jsonResponse({
    error: error?.message ?? (action === 'view'
      ? 'Notebook viewing was not authorized.'
      : 'Notebook delivery was not authorized.'),
  }, 403);

  const finalizeAudit = async (status: 'delivered' | 'failed', failureCode: string | null = null) =>
    userClient.rpc(action === 'view' ? 'finalize_ae_notebook_view' : 'finalize_ae_notebook_delivery', {
      p_audit_id: delivery.audit_id,
      p_status: status,
      p_failure_code: failureCode,
    });

  const encodedPath = delivery.github_path.split('/').map(encodeURIComponent).join('/');
  const githubResponse = await fetch(
    `https://api.github.com/repos/ml4ea/ae-notebooks/contents/${encodedPath}?ref=main`,
    {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ML4EA-portal',
      },
    },
  );
  if (!githubResponse.ok) {
    console.error('Protected notebook GitHub retrieval failed', {
      path: delivery.github_path,
      status: githubResponse.status,
    });
    await finalizeAudit('failed', `github_${githubResponse.status}`);
    return jsonResponse({ error: 'The protected notebook could not be retrieved from its private source.' }, 502);
  }

  const notebook = await githubResponse.arrayBuffer();
  if (await sha256Hex(notebook) !== delivery.source_sha256) {
    console.error('Protected notebook checksum mismatch', { path: delivery.github_path });
    await finalizeAudit('failed', 'checksum_mismatch');
    return jsonResponse({ error: 'The protected notebook does not match its validated source checksum.' }, 502);
  }

  const { error: auditError } = await finalizeAudit('delivered');
  if (auditError) {
    console.error('Protected notebook audit finalization failed', auditError);
    return jsonResponse({ error: 'The protected notebook transfer audit could not be completed.' }, 500);
  }

  return jsonResponse({
    notebookBase64: base64(notebook),
    filename: delivery.source_filename,
    sourceSha256: delivery.source_sha256,
    notebookVersion: delivery.notebook_version,
  });
});
