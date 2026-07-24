import { CheckCircle2, Download, ExternalLink, FileCode2, HardDrive, LockKeyhole, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

interface Props {
  slug: string;
  aeNumber: string;
  title: string;
  showDormantNotice?: boolean;
}

interface Capabilities {
  eligible: boolean;
  colab_enabled: boolean;
  download_enabled: boolean;
  notice_version: string;
  notice_text: string;
}

interface Delivery {
  notebookBase64: string;
  filename: string;
  sourceSha256: string;
  notebookVersion: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const googleClientId = import.meta.env.PUBLIC_GOOGLE_DRIVE_CLIENT_ID?.trim();
const driveScope = 'https://www.googleapis.com/auth/drive.file';
let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityServices() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ml4ea-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google authorization could not be loaded.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.ml4eaGoogleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google authorization could not be loaded.'));
    document.head.append(script);
  });
  return googleScriptPromise;
}

async function requestGoogleDriveToken() {
  if (!googleClientId) throw new Error('Google Colab delivery is not configured.');
  await loadGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: driveScope,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description ?? 'Google Drive authorization was not completed.'));
      },
      error_callback: () => reject(new Error('Google Drive authorization was cancelled or blocked.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function driveRequest<T>(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Google Drive could not complete the request.');
  }
  return response.json() as Promise<T>;
}

async function getOrCreateMl4eaFolder(token: string) {
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    "appProperties has { key='ml4eaManaged' and value='true' }",
  ].join(' and ');
  const params = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id,name)', pageSize: '1' });
  const listed = await driveRequest<{ files?: Array<{ id: string }> }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    token,
  );
  if (listed.files?.[0]?.id) return listed.files[0].id;

  const folder = await driveRequest<{ id: string }>('https://www.googleapis.com/drive/v3/files?fields=id', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'ML4EA',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { ml4eaManaged: 'true' },
    }),
  });
  return folder.id;
}

async function getDriveUserEmail(token: string) {
  const about = await driveRequest<{ user?: { emailAddress?: string } }>(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    token,
  );
  if (!about.user?.emailAddress) throw new Error('Google Drive did not identify the selected account.');
  return about.user.emailAddress;
}

async function findManagedNotebook(token: string, slug: string) {
  const safeSlug = slug.replaceAll("'", "\\'");
  const query = [
    'trashed = false',
    `appProperties has { key='ml4eaSlug' and value='${safeSlug}' }`,
  ].join(' and ');
  const params = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id,appProperties)', pageSize: '1' });
  const listed = await driveRequest<{ files?: Array<{ id: string; appProperties?: Record<string, string> }> }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    token,
  );
  return listed.files?.[0] ?? null;
}

async function uploadNotebookToDrive(
  token: string,
  notebook: Blob,
  delivery: Delivery,
  slug: string,
  folderId: string,
) {
  const existing = await findManagedNotebook(token, slug);
  if (existing?.appProperties?.sourceSha256 === delivery.sourceSha256) return existing.id;

  const boundary = `ml4ea_${crypto.randomUUID()}`;
  const metadata: Record<string, unknown> = {
    name: delivery.filename,
    mimeType: 'application/x-ipynb+json',
    appProperties: {
      ml4eaSlug: slug,
      sourceSha256: delivery.sourceSha256,
      notebookVersion: delivery.notebookVersion,
    },
  };
  if (!existing) metadata.parents = [folderId];

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: application/x-ipynb+json\r\n\r\n`,
    notebook,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });

  const endpoint = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const uploaded = await driveRequest<{ id: string }>(endpoint, token, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return uploaded.id;
}

function saveNotebook(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function notebookBlob(delivery: Delivery) {
  const binary = window.atob(delivery.notebookBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'application/x-ipynb+json' });
}

export default function NotebookUseControl({ slug, aeNumber, title, showDormantNotice = false }: Props) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'colab' | 'download'>('colab');
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let current = true;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc('get_ae_delivery_capabilities').then(({ data, error: capabilityError }) => {
      if (!current || capabilityError) return;
      const value = (data?.[0] ?? null) as Capabilities | null;
      setCapabilities(value);
      if (value && (!value.colab_enabled || !googleClientId) && value.download_enabled) setAction('download');
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!open || !dialogRef.current || dialogRef.current.open) return;
    dialogRef.current.showModal();
  }, [open]);

  const colabAvailable = Boolean(capabilities?.colab_enabled && googleClientId);
  const downloadAvailable = Boolean(capabilities?.download_enabled);
  const anyAvailable = colabAvailable || downloadAvailable;
  const selectedAvailable = action === 'colab' ? colabAvailable : downloadAvailable;
  const actionLabel = !anyAvailable
    ? 'Available after permission'
    : action === 'colab'
      ? 'Continue to Google Colab'
      : 'Download notebook';
  const description = useMemo(() => `AE ${aeNumber}: ${title}`, [aeNumber, title]);

  const close = () => {
    if (working) return;
    dialogRef.current?.close();
    setOpen(false);
    setAcknowledged(false);
    setError('');
    setSuccess('');
  };

  const requestDelivery = async (selectedAction: 'colab' | 'download') => {
    const supabase = getSupabaseClient();
    if (!supabase || !capabilities) throw new Error('Protected notebook delivery is unavailable.');
    const { data, error: deliveryError } = await supabase.functions.invoke('deliver-ae-notebook', {
      body: {
        slug,
        action: selectedAction,
        noticeVersion: capabilities.notice_version,
      },
    });
    if (deliveryError) {
      const response = (deliveryError as { context?: Response }).context;
      const responseBody = response
        ? await response.clone().json().catch(() => null) as { error?: string } | null
        : null;
      throw new Error(responseBody?.error ?? data?.error ?? deliveryError.message);
    }
    if (!data?.notebookBase64) throw new Error(data?.error ?? 'The protected notebook could not be prepared.');
    return data as Delivery;
  };

  const proceed = async () => {
    if (!acknowledged || !selectedAvailable) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      if (action === 'download') {
        const delivery = await requestDelivery('download');
        saveNotebook(notebookBlob(delivery), delivery.filename);
        setAcknowledged(false);
        setSuccess(`Download started for ${delivery.filename}. Check your browser's Downloads list if it does not appear on screen.`);
        return;
      }

      const token = await requestGoogleDriveToken();
      const delivery = await requestDelivery('colab');
      const notebook = notebookBlob(delivery);
      const [folderId, driveEmail] = await Promise.all([
        getOrCreateMl4eaFolder(token),
        getDriveUserEmail(token),
      ]);
      const fileId = await uploadNotebookToDrive(
        token,
        notebook,
        delivery,
        slug,
        folderId,
      );
      const colabUrl = new URL(`https://colab.research.google.com/drive/${encodeURIComponent(fileId)}`);
      const accountChooser = new URL('https://accounts.google.com/AccountChooser');
      accountChooser.searchParams.set('Email', driveEmail);
      accountChooser.searchParams.set('continue', colabUrl.toString());
      window.location.assign(accountChooser);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The notebook could not be prepared.');
    } finally {
      setWorking(false);
    }
  };

  if (!capabilities) return null;

  return <div className="ae-use-control">
    <button className="button button-primary" type="button" onClick={() => { setSuccess(''); setOpen(true); }}>
      <FileCode2 aria-hidden="true" size={18} /> Use example
    </button>
    <p>{anyAvailable
      ? 'Authorized personal use only. Each transfer requires acknowledgment and is recorded.'
      : 'Preview the protected delivery choices and restrictions.'}</p>
    {!anyAvailable && showDormantNotice && <div className="ae-delivery-dormant">
      <LockKeyhole aria-hidden="true" size={18} />
      <p><strong>Controlled notebook delivery is prepared but inactive.</strong> Google Colab and local download remain disabled pending written publisher permission.</p>
    </div>}

    {open && <dialog ref={dialogRef} className="ae-use-dialog" aria-labelledby="ae-use-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)}>
      <button className="ae-use-dialog-close" type="button" onClick={close} aria-label="Close notebook options" disabled={working}>
        <X aria-hidden="true" size={22} />
      </button>
      <p className="eyebrow">Protected notebook · AE {aeNumber}</p>
      <h2 id="ae-use-title">Choose how to use this notebook.</h2>
      <p className="ae-use-dialog-description">{description}</p>

      <fieldset className="ae-delivery-options">
        <legend>Notebook destination</legend>
        <label className={colabAvailable ? '' : 'is-disabled'}>
          <input type="radio" name="notebook-action" value="colab" checked={action === 'colab'} onChange={() => { setAction('colab'); setError(''); setSuccess(''); }} disabled={!colabAvailable || working} />
          <HardDrive aria-hidden="true" size={22} />
          <span><strong>Load to Google Colab</strong><small>Default. Save or update a private copy in the ML4EA folder in your Google Drive, then open it in Colab.</small></span>
        </label>
        <label className={downloadAvailable ? '' : 'is-disabled'}>
          <input type="radio" name="notebook-action" value="download" checked={action === 'download'} onChange={() => { setAction('download'); setError(''); setSuccess(''); }} disabled={!downloadAvailable || working} />
          <Download aria-hidden="true" size={22} />
          <span><strong>Download .ipynb file</strong><small>Use the notebook in a local Jupyter environment. Keep the file private and tied to your authorized access.</small></span>
        </label>
      </fieldset>

      <div className="ae-access-notice">
        <LockKeyhole aria-hidden="true" size={20} />
        <div><strong>Access and use restrictions</strong><p>{capabilities.notice_text}</p></div>
      </div>

      {!anyAvailable && <p className="form-message" role="status">This preview shows the planned workflow. Notebook transfer will remain unavailable until written publisher permission is recorded.</p>}

      <label className="ae-acknowledgment">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={working} />
        <span>I have read these restrictions and accept responsibility for my copy and its use.</span>
      </label>

      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {success && <p className="form-message form-success ae-download-success" role="status"><CheckCircle2 aria-hidden="true" size={19} /> {success}</p>}
      <div className="ae-use-dialog-actions">
        <button className="button button-secondary" type="button" onClick={close} disabled={working}>Cancel</button>
        <button className="button button-primary" type="button" onClick={() => void proceed()} disabled={!acknowledged || !selectedAvailable || working}>
          {working ? 'Preparing notebook...' : actionLabel}
          {action === 'colab' && !working && <ExternalLink aria-hidden="true" size={17} />}
        </button>
      </div>
      {action === 'colab' && <p className="ae-google-scope">Google will ask for permission to manage only files this portal creates or opens; it does not grant access to the rest of your Drive.</p>}
    </dialog>}
  </div>;
}
