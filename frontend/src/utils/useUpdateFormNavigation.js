import { useEffect, useRef, useState } from 'react';

export default function useUpdateFormNavigation(editingKey) {
  const editorRef = useRef(null);
  const recordsRef = useRef(null);
  const [updatedId, setUpdatedId] = useState(null);
  const [savedUpdate, setSavedUpdate] = useState(null);

  useEffect(() => {
    if (!editingKey) return;
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [editingKey]);

  const markUpdated = (id) => {
    if (id) setSavedUpdate({ id });
    setUpdatedId(id);
    window.setTimeout(() => setUpdatedId((current) => current === id ? null : current), 3500);
  };

  const scrollToRecords = () => {
    requestAnimationFrame(() => recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords };
}
