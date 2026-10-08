import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFormReviewed, markFormReviewed, reviewKey } from '../utils/reviewedForms';

const NEW_FORM_WINDOW = 24 * 60 * 60 * 1000;

export default function NewFormBadge({ record }) {
  const { user } = useAuth();
  const key = reviewKey(user?._id, record?._id);
  const marker = useRef(null);
  const [reviewed, setReviewed] = useState(() => isFormReviewed(key));
  const created = new Date(record?.createdAt).getTime();
  const age = Date.now() - created;
  const recent = Number.isFinite(created) && age >= 0 && age < NEW_FORM_WINDOW;

  useEffect(() => {
    setReviewed(isFormReviewed(key));
    const card = marker.current?.closest('.saved-record');
    const check = event => {
      const action = event.target instanceof Element ? event.target.closest('button, a') : null;
      if (action && card?.contains(action) && !action.disabled && action.getAttribute('aria-disabled') !== 'true') markFormReviewed(key);
    };
    const refresh = event => {
      if (event.type === 'storage' && event.key !== key && event.key !== null) return;
      if (event.type === 'pams:form-reviewed' && event.detail !== key) return;
      setReviewed(isFormReviewed(key));
    };
    card?.addEventListener('click', check, true);
    window.addEventListener('storage', refresh);
    window.addEventListener('pams:form-reviewed', refresh);
    return () => {
      card?.removeEventListener('click', check, true);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pams:form-reviewed', refresh);
    };
  }, [key, recent]);

  return <span ref={marker} className={recent && !reviewed ? 'recent-form-marker' : 'reviewed-form-marker'} aria-hidden="true" />;
}
