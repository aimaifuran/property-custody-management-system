import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

export default function useRecordActivity(adminId) {
  const key = `viewed-user-records:${adminId}`;
  const [activity, setActivity] = useState({});
  const [seen, setSeen] = useState({});
  useEffect(() => {
    if (!adminId) return undefined;
    const syncSeen = () => {
      try { setSeen(JSON.parse(localStorage.getItem(key) || '{}')); } catch { /* Keep session state. */ }
    };
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const { data } = await axios.get('/users/record-activity', { signal: controller.signal });
        if (!controller.signal.aborted) {
          setActivity(data.data || {});
          try { setSeen(JSON.parse(localStorage.getItem(key) || '{}')); } catch { /* Retain session state. */ }
        }
      } catch { /* Keep the last known indicators until the next refresh. */ }
    };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('user-records-viewed', syncSeen);
    window.addEventListener('storage', syncSeen);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('user-records-viewed', syncSeen); window.removeEventListener('storage', syncSeen); };
  }, [key, adminId]);
  const markViewed = useCallback((id, version) => {
    if (!version) return;
    setSeen(previous => {
      if (Number(previous[id] || 0) >= version) return previous;
      const next = { ...previous, [id]: version };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session state still works when storage is unavailable. */ }
      queueMicrotask(() => window.dispatchEvent(new Event('user-records-viewed')));
      return next;
    });
  }, [key]);
  return { activity, markViewed, hasUnread: !!adminId && Object.keys(activity).some(id => Number(activity[id] || 0) > Number(seen[id] || 0)), hasNew: id => Number(activity[id] || 0) > Number(seen[id] || 0) };
}
