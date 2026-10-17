import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

// Options are { value, label, keywords? }; free text remains editable.
export default function SearchInput({ options = [], value = '', onChange, onSelect, onFocus, ...props }) {
  const id = useId();
  const [anchor, setAnchor] = useState(null);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const close = event => { if (event.target instanceof Element && event.target.closest('[role="listbox"]')) return; setAnchor(null); };
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, []);
  const query = value.trim().toLocaleLowerCase();
  const matches = query ? options.filter(option => `${option.label} ${option.keywords || ''}`.toLocaleLowerCase().includes(query)).slice(0, 20) : [];
  const open = Boolean(anchor && matches.length);
  const choose = option => { onChange(option.label); onSelect?.(option); setAnchor(null); setActive(-1); };
  return <>
    <input {...props} value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
      onFocus={event => { onFocus?.(event); setAnchor(event.currentTarget.getBoundingClientRect()); setActive(-1); }}
      onBlur={() => { setAnchor(null); setActive(-1); }}
      onChange={event => { setAnchor(event.currentTarget.getBoundingClientRect()); setActive(-1); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setAnchor(null); setActive(-1); }
        if (!open) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => event.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length - 1 : index - 1)); }
        if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(matches[active]); }
      }} />
    {open && createPortal(<div id={id} role="listbox" onMouseDown={event => event.preventDefault()} className="fixed z-[100] max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" style={{ left: Math.min(anchor.left, window.innerWidth - Math.max(anchor.width, 220)), top: anchor.bottom + 4, width: Math.max(anchor.width, 220), maxHeight: Math.max(80, Math.min(208, window.innerHeight - anchor.bottom - 12)) }}>
      {matches.map((option, index) => <div id={`${id}-${index}`} key={option.value} role="option" aria-selected={active === index} onMouseEnter={() => setActive(index)} onClick={() => choose(option)} className={`cursor-pointer px-3 py-2 text-sm text-slate-800 ${active === index ? 'bg-emerald-50' : ''}`}>{option.label}</div>)}
    </div>, document.body)}
  </>;
}
