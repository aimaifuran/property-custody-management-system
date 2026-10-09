import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function DeveloperProfiles({ developers }) {
  const { user } = useAuth();
  const [pictures, setPictures] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState('');
  const [attempt, setAttempt] = useState(0);
  const inputs = useRef({});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get('/about/developer-pictures', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setPictures(data.data || {}); })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load developer pictures. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const upload = async (id, event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image, 2 MB or smaller.'); return; }
    setUploading(id); setError('');
    try {
      const form = new FormData(); form.append('picture', file);
      const { data } = await axios.post(`/about/developer-pictures/${id}`, form);
      setPictures(previous => ({ ...previous, [id]: data.data.picture }));
    } catch (error) { setError(error.response?.data?.message || 'Unable to save developer picture. Please try again.'); }
    finally { setUploading(''); }
  };
  const admin = user?.role === 'admin';
  return <>
    {loading && <p role="status" className="mt-3 text-sm text-slate-500">Loading developer pictures...</p>}
    {error && <div role="alert" className="mt-3 text-sm text-rose-700">{error} <button type="button" disabled={!!uploading} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {admin && <p className="mt-3 text-sm text-slate-500">Click a picture to upload or change it. JPG, PNG, WebP · Max 2 MB.</p>}
    <ul className="developer-profile-grid">{developers.map((name, index) => {
      const id = `developer-${index}`;
      const portrait = <span className="developer-portrait">{pictures[id] ? <img src={pictures[id]} alt={admin ? '' : name} /> : <span aria-hidden="true">{name.split(' ').filter(word => word.length > 2).map(word => word[0]).slice(0, 2).join('')}</span>}</span>;
      return <li key={id} className="developer-profile-card">
        {admin ? <><button type="button" className="developer-picture-trigger" aria-label={`Change picture for ${name}`} disabled={loading || !!uploading} onClick={() => inputs.current[id]?.click()}>{portrait}<span className="developer-camera"><Camera size={16} aria-hidden="true" /></span></button><input hidden type="file" ref={input => { inputs.current[id] = input; }} accept="image/jpeg,image/png,image/webp" aria-label={`Choose picture for ${name}`} onChange={event => upload(id, event)} disabled={loading || !!uploading} /></> : portrait}
        <h3>{name}</h3>
        {uploading === id && <p role="status">Saving picture...</p>}
      </li>;
    })}</ul>
  </>;
}
