import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function useSourceDocument(records, setRecords, open, endpoint) {
  const [params, setParams] = useSearchParams();
  const id = params.get('record');
  const openRef = useRef(open); openRef.current = open;
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const finish = () => setParams(previous => { const next = new URLSearchParams(previous); next.delete('record'); return next; }, { replace: true });
    const record = records.find(record => record._id === id);
    if (record) { openRef.current(record); finish(); return; }
    axios.get(endpoint, { signal: controller.signal }).then(({ data }) => {
      const rows = Array.isArray(data.data) ? data.data : data.data?.items || [];
      const found = rows.find(record => record._id === id);
      if (found) setRecords(previous => [...previous.filter(record => record._id !== id), found]);
      else { toast.error('Source document is unavailable or you do not have access.'); finish(); }
    }).catch(() => { if (!controller.signal.aborted) { toast.error('Unable to open source document.'); finish(); } });
    return () => controller.abort();
  }, [id, records, setRecords, endpoint, setParams]);
}
