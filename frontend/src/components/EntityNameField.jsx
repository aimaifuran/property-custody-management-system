import { useEffect, useRef } from 'react';

export const FIXED_ENTITY_NAME = 'LGU Carigara';
export default function EntityNameField({ value = '', onChange, isNew = true }) {
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (isNew && value !== FIXED_ENTITY_NAME) change.current?.(FIXED_ENTITY_NAME);
  }, [value, isNew]);
  return <div className="entity-name-field min-w-0">
    <span className="mb-1 block text-sm font-semibold text-slate-700">Entity Name:</span>
    <p aria-label="Entity Name" className="entity-name-value text-sm text-slate-800 whitespace-pre-wrap break-words">{isNew ? FIXED_ENTITY_NAME : value || FIXED_ENTITY_NAME}</p>
  </div>;
}
