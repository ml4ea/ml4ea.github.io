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
  storage_path: string;
  source_filename: string;
  source_sha256: string;
  notebook_version: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Protected notebook delivery is not configured.' }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Your session is not valid.' }, 401);

  const { slug, action, noticeVersion } = await request.json() as {
    slug?: string;
    action?: 'colab' | 'download';
    noticeVersion?: string;
  };
  if (!slug || !action || !noticeVersion) {
    return jsonResponse({ error: 'Notebook, action, and notice acknowledgment are required.' }, 400);
  }

  const { data, error } = await userClient.rpc('prepare_ae_notebook_delivery', {
    p_slug: slug,
    p_action: action,
    p_notice_version: noticeVersion,
  });
  const delivery = (data?.[0] ?? null) as DeliveryRecord | null;
  if (error || !delivery) return jsonResponse({ error: error?.message ?? 'Notebook delivery was not authorized.' }, 403);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signed, error: signedError } = await serviceClient.storage
    .from('ae-notebooks')
    .createSignedUrl(delivery.storage_path, 60);

  if (signedError || !signed?.signedUrl) {
    await serviceClient
      .from('ae_delivery_audit')
      .update({ status: 'failed', failure_code: 'signed_url_failed' })
      .eq('id', delivery.audit_id);
    return jsonResponse({ error: 'The protected notebook could not be prepared.' }, 502);
  }

  await serviceClient
    .from('ae_delivery_audit')
    .update({ status: 'delivered', delivered_at: new Date().toISOString(), failure_code: null })
    .eq('id', delivery.audit_id);

  return jsonResponse({
    signedUrl: signed.signedUrl,
    filename: delivery.source_filename,
    sourceSha256: delivery.source_sha256,
    notebookVersion: delivery.notebook_version,
    expiresIn: 60,
  });
});
