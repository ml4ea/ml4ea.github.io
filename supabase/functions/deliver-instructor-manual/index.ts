import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ml4ea.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type PreparedDownload = {
  edition_id: string;
  pdf_storage_path: string;
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
    return jsonResponse({ error: 'Protected manual delivery is not configured.' }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Your session is not valid.' }, 401);

  const { editionId, noticeVersion } = await request.json() as {
    editionId?: string;
    noticeVersion?: string;
  };
  if (!editionId || !noticeVersion) {
    return jsonResponse({ error: 'Manual edition and copyright acknowledgment are required.' }, 400);
  }

  const { data, error: preparationError } = await userClient.rpc(
    'prepare_instructor_manual_download',
    {
      p_edition_id: editionId,
      p_notice_version: noticeVersion,
    },
  );
  const prepared = (data?.[0] ?? null) as PreparedDownload | null;
  if (preparationError || !prepared) {
    return jsonResponse({
      error: preparationError?.message ?? 'Manual download was not authorized.',
    }, 403);
  }

  const { data: signed, error: signedUrlError } = await serviceClient.storage
    .from('instructor-materials')
    .createSignedUrl(prepared.pdf_storage_path, 60);
  if (signedUrlError || !signed?.signedUrl) {
    console.error('Manual signed URL creation failed', {
      editionId: prepared.edition_id,
      error: signedUrlError?.message,
    });
    return jsonResponse({ error: 'The protected manual download could not be prepared.' }, 502);
  }

  const { data: eventId, error: auditError } = await userClient.rpc(
    'record_instructor_manual_download_issued',
    {
      p_edition_id: prepared.edition_id,
      p_notice_version: noticeVersion,
    },
  );
  if (auditError || !eventId) {
    console.error('Manual download-issued audit failed', {
      editionId: prepared.edition_id,
      error: auditError?.message,
    });
    return jsonResponse({ error: 'The manual download audit could not be completed.' }, 500);
  }

  return jsonResponse({
    signedUrl: signed.signedUrl,
    expiresIn: 60,
    status: 'Download issued',
  });
});
