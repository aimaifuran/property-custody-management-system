import { useEffect, useState } from 'react';
import axios from 'axios';

export const returnRequestUserId = request => String(request.submittedBy?._id || request.submittedBy || request.returnedBy?.user?._id || request.returnedBy?.user || '');
export const pendingUserReturns = requests => requests.filter(request => request.status === 'PENDING' && returnRequestUserId(request));
export default function usePendingReturns(enabled = true) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!enabled) { setRequests([]); return; }
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { data } = await axios.get('/custody/returns', { signal: controller.signal });
        if (!controller.signal.aborted) setRequests(pendingUserReturns(data.data || []));
      } catch { /* Preserve the last count and retry on the next refresh. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    window.addEventListener('return-requests-updated', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('return-requests-updated', refresh); };
  }, [enabled]);
  return requests;
}
