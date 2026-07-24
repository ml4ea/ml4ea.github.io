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

type NotebookFileRecord = {
  storage_path: string;
  source_filename: string;
  source_sha256: string;
};

const sha256Hex = async (value: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const { data: isOwner, error: ownerError } = await userClient.rpc('is_portal_owner');
    if (ownerError || !isOwner) return jsonResponse({ error: 'The permanent portal owner is required.' }, 403);

    const form = await request.formData();
    const slug = form.get('slug');
    const file = form.get('file');
    if (typeof slug !== 'string' || !(file instanceof File)) {
      return jsonResponse({ error: 'Notebook slug and file are required.' }, 400);
    }

    const { data: metadata, error: metadataError } = await serviceClient
      .from('ae_notebook_files')
      .select('storage_path, source_filename, source_sha256')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();
    const notebook = metadata as NotebookFileRecord | null;
    if (metadataError || !notebook) return jsonResponse({ error: 'Protected notebook metadata was not found.' }, 404);
    if (file.name !== notebook.source_filename) {
      return jsonResponse({ error: `Expected ${notebook.source_filename}.` }, 400);
    }

    const contents = await file.arrayBuffer();
    if (await sha256Hex(contents) !== notebook.source_sha256) {
      return jsonResponse({ error: `${file.name} does not match the validated source checksum.` }, 400);
    }

    const { error: uploadError } = await serviceClient.storage
      .from('ae-notebooks')
      .upload(notebook.storage_path, contents, {
        contentType: 'application/x-ipynb+json',
        upsert: true,
      });
    if (uploadError) {
      console.error('Protected notebook upload failed', uploadError);
      return jsonResponse({ error: `Storage rejected ${file.name}.` }, 502);
    }
    return jsonResponse({ uploaded: true, filename: file.name, storagePath: notebook.storage_path });
  }

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

  const { data: signed, error: signedError } = await serviceClient.storage
    .from('ae-notebooks')
    .createSignedUrl(delivery.storage_path, 60);

  if (signedError || !signed?.signedUrl) {
    console.error('Protected notebook signed URL failed', {
      path: delivery.storage_path,
      error: signedError,
    });
    await serviceClient
      .from('ae_delivery_audit')
      .update({ status: 'failed', failure_code: 'signed_url_failed' })
      .eq('id', delivery.audit_id);
    return jsonResponse({ error: 'The protected notebook file is missing from private Storage.' }, 502);
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
