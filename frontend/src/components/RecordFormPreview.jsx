import { useEffect, useState } from 'react';
import { getOfficialFormPdf } from '../utils/formPdfCache';
import Skeleton from './Skeleton';

export default function RecordFormPreview({ record }) {
  const [preview, setPreview] = useState({ url: '', error: '' });
  useEffect(() => {
    let active = true;
    let url;
    setPreview({ url: '', error: '' });
    getOfficialFormPdf(record).then(bytes => {
      if (!active) return;
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPreview({ url, error: '' });
    }).catch(error => { if (active) setPreview({ url: '', error: error.message || 'Unable to preview this form' }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [record]);
  if (preview.error) return <p role="alert" className="rounded-lg border border-rose-200 p-4 text-rose-700">{preview.error}</p>;
  if (!preview.url) return <Skeleton className="h-[60vh] w-full" label="Loading form preview..." />;
  return <div><iframe title={`${record.title || record.type} form preview`} className="record-form-preview" src={`${preview.url}#view=FitH`} /><a href={preview.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-emerald-700 underline">Open form preview</a></div>;
}
