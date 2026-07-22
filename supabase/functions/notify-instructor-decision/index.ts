import mailer from 'jsr:@neabyte/deno-mailer@0.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ml4ea.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const smtpUser = Deno.env.get('ML4EA_SMTP_USER');
  const smtpPass = Deno.env.get('ML4EA_SMTP_PASS');
  if (!supabaseUrl || !supabaseAnonKey || !smtpUser || !smtpPass) {
    return jsonResponse({ error: 'Email notification service is not configured.' }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Your session is not valid.' }, 401);

  const { applicationId, notificationType = 'decision' } = await request.json() as {
    applicationId?: string;
    notificationType?: 'submission' | 'decision';
  };
  if (!applicationId) return jsonResponse({ error: 'Application ID is required.' }, 400);

  const transporter = mailer.transporter({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { type: 'password', user: smtpUser, pass: smtpPass },
  });

  if (notificationType === 'submission') {
    const { data: application, error: applicationError } = await supabase
      .from('instructor_applications')
      .select('id,user_id,email,institution,department,position_title,faculty_url,course_context,status')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (applicationError || !application) return jsonResponse({ error: 'Instructor application not found.' }, 404);
    if (application.status !== 'pending') return jsonResponse({ error: 'Only pending applications generate submission notifications.' }, 409);

    const adminEmail = Deno.env.get('ML4EA_ADMIN_EMAIL') ?? 'ml4ea.book@gmail.com';
    const reviewUrl = 'https://ml4ea.github.io/admin/instructors/';
    const text = [
      'A new ML4EA instructor access request is ready for review.',
      `Applicant: ${application.email}`,
      `Institution: ${application.institution}`,
      `Department: ${application.department}`,
      `Position: ${application.position_title}`,
      `Institutional profile: ${application.faculty_url}`,
      application.course_context ? `Course context: ${application.course_context}` : null,
      `Review the request: ${reviewUrl}`,
    ].filter((line) => line !== null).join('\n\n');

    try {
      await transporter.send({
        from: `"ML4EA Book" <${smtpUser}>`,
        to: adminEmail,
        subject: `New ML4EA instructor access request: ${application.email}`,
        text,
        html: `<p>A new ML4EA instructor access request is ready for review.</p><ul><li><strong>Applicant:</strong> ${escapeHtml(application.email)}</li><li><strong>Institution:</strong> ${escapeHtml(application.institution)}</li><li><strong>Department:</strong> ${escapeHtml(application.department)}</li><li><strong>Position:</strong> ${escapeHtml(application.position_title)}</li><li><strong>Institutional profile:</strong> <a href="${escapeHtml(application.faculty_url)}">${escapeHtml(application.faculty_url)}</a></li>${application.course_context ? `<li><strong>Course context:</strong> ${escapeHtml(application.course_context)}</li>` : ''}</ul><p><a href="${reviewUrl}">Review the instructor request</a>.</p>`,
      });
      return jsonResponse({ delivered: true });
    } catch (error) {
      console.error('Instructor submission email failed:', error);
      return jsonResponse({ error: 'The application was saved, but its administrator notification could not be sent.' }, 502);
    }
  }

  if (notificationType !== 'decision') return jsonResponse({ error: 'Unsupported notification type.' }, 400);

  const { data: admin } = await supabase.rpc('is_portal_admin');
  if (!admin) return jsonResponse({ error: 'Portal administrator access is required.' }, 403);

  const { data: application, error: applicationError } = await supabase
    .from('instructor_applications')
    .select('email,status,decision_note')
    .eq('id', applicationId)
    .maybeSingle();
  if (applicationError || !application) return jsonResponse({ error: 'Instructor application not found.' }, 404);
  if (application.status !== 'approved' && application.status !== 'rejected') {
    return jsonResponse({ error: 'The application does not have a completed decision.' }, 409);
  }

  const approved = application.status === 'approved';
  const decision = approved ? 'approved' : 'not approved';
  const note = application.decision_note?.trim();
  const workspaceUrl = 'https://ml4ea.github.io/instructor/';
  const text = [
    `Your request for ML4EA instructor access has been ${decision}.`,
    note ? `Decision note: ${note}` : null,
    approved ? `Open the instructor workspace: ${workspaceUrl}` : 'You may update your information and submit it for review again.',
    '',
    'ML4EA Book',
  ].filter((line) => line !== null).join('\n\n');

  try {
    await transporter.send({
      from: `"ML4EA Book" <${smtpUser}>`,
      to: application.email,
      subject: `Your ML4EA instructor access request was ${decision}`,
      text,
      html: `<p>Your request for ML4EA instructor access has been <strong>${decision}</strong>.</p>${note ? `<p><strong>Decision note:</strong> ${escapeHtml(note)}</p>` : ''}${approved ? `<p><a href="${workspaceUrl}">Open the instructor workspace</a>.</p>` : '<p>You may update your information and submit it for review again.</p>'}<p>ML4EA Book</p>`,
    });
    return jsonResponse({ delivered: true });
  } catch (error) {
    console.error('Instructor decision email failed:', error);
    return jsonResponse({ error: 'The decision was saved, but its notification email could not be sent.' }, 502);
  }
});
