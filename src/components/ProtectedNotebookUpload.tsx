import { CheckCircle2, FileCode2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

const expectedNotebooks = new Map([
  ['Notebook-07.5.5-SVM-cwru-bearing.ipynb', 'svm-bearing-fault-classification'],
  ['Notebook-09.5.2-CNN-NEU-DET.ipynb', 'cnn-surface-defect-detection'],
  ['Notebook-12.3.5-VAE-SensorAnomaly.ipynb', 'vae-sensor-anomaly-detection'],
]);

async function functionErrorMessage(error: unknown, fallback: string) {
  const response = (error as { context?: Response } | null)?.context;
  if (!response) return error instanceof Error ? error.message : fallback;
  const body = await response.clone().json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export default function ProtectedNotebookUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const upload = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const selected = new Map(files.map((file) => [file.name, file]));
    const missing = [...expectedNotebooks.keys()].filter((name) => !selected.has(name));
    if (missing.length) {
      setError(`Select all three validated notebooks. Missing: ${missing.join(', ')}`);
      return;
    }

    setWorking(true);
    setError('');
    setUploaded([]);
    const completed: string[] = [];
    try {
      for (const [filename, slug] of expectedNotebooks) {
        const form = new FormData();
        form.append('slug', slug);
        form.append('file', selected.get(filename)!);
        const { data, error: uploadError } = await supabase.functions.invoke('deliver-ae-notebook', { body: form });
        if (uploadError) throw new Error(await functionErrorMessage(uploadError, `Upload failed for ${filename}.`));
        if (!data?.uploaded) throw new Error(data?.error ?? `Upload failed for ${filename}.`);
        completed.push(filename);
        setUploaded([...completed]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The protected notebooks could not be uploaded.');
    } finally {
      setWorking(false);
    }
  };

  return <section className="admin-notebook-upload" aria-labelledby="admin-notebook-upload-heading">
    <div className="admin-notebook-upload-heading">
      <UploadCloud aria-hidden="true" size={26} />
      <div>
        <p className="eyebrow">Owner-only setup</p>
        <h2 id="admin-notebook-upload-heading">Protected AE notebook files.</h2>
        <p>Upload the three validated source notebooks directly to private Storage. Checksums and filenames are verified before replacement.</p>
      </div>
    </div>

    <label className="admin-notebook-file-field">
      <span>Select all three `.ipynb` files</span>
      <input
        type="file"
        accept=".ipynb,application/json,application/x-ipynb+json,application/octet-stream"
        multiple
        onChange={(event) => {
          setFiles(Array.from(event.target.files ?? []));
          setUploaded([]);
          setError('');
        }}
        disabled={working}
      />
    </label>

    <ul className="admin-notebook-file-list">
      {[...expectedNotebooks.keys()].map((filename) => <li key={filename} className={uploaded.includes(filename) ? 'is-uploaded' : ''}>
        {uploaded.includes(filename) ? <CheckCircle2 aria-hidden="true" size={18} /> : <FileCode2 aria-hidden="true" size={18} />}
        <span>{filename}</span>
      </li>)}
    </ul>

    <button className="button button-primary" type="button" onClick={() => void upload()} disabled={working || files.length === 0}>
      <UploadCloud aria-hidden="true" size={18} /> {working ? `Uploading ${uploaded.length + 1} of 3...` : 'Upload protected notebooks'}
    </button>

    {uploaded.length === expectedNotebooks.size && <p className="form-message form-success" role="status"><CheckCircle2 aria-hidden="true" size={19} /> All three protected notebooks are present in private Storage.</p>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </section>;
}
