import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { displayDate, parseDisplayDate } from '../utils/dateInput';

function CalendarInput({ value = '', onChange, className = '', readOnly, disabled, ...props }) {
  const [text, setText] = useState(() => displayDate(value));
  const input = useRef(null);
  const calendar = useRef(null);
  useEffect(() => { setText(displayDate(value)); }, [value]);
  useEffect(() => {
    input.current?.setCustomValidity(text && !parseDisplayDate(text) ? 'Enter a valid date in MM/DD/YYYY format.' : '');
  }, [text]);
  const change = (event, nextText, isoDate) => {
    setText(nextText);
    if (!nextText || isoDate) onChange?.({ ...event, target: { ...event.target, name: props.name, value: isoDate || '' }, currentTarget: { ...event.currentTarget, value: isoDate || '' } });
  };
  return <span className="relative block w-full">
    <input {...props} ref={input} type="text" inputMode="numeric" placeholder="MM/DD/YYYY" maxLength={10}
      value={text} readOnly={readOnly} disabled={disabled} className={`${className} pr-10`}
      onChange={event => change(event, event.target.value, parseDisplayDate(event.target.value))} />
    {!readOnly && !disabled && <>
      <input ref={calendar} type="date" tabIndex={-1} aria-hidden="true" value={value || ''}
        min={props.min} max={props.max} className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        onChange={event => change(event, displayDate(event.target.value), event.target.value)} />
      <button type="button" aria-label={`Choose ${props['aria-label'] || 'date'}`} className="absolute inset-y-0 right-2 flex items-center px-1 text-slate-600"
        onClick={() => { if (calendar.current?.showPicker) calendar.current.showPicker(); else input.current?.focus(); }}><CalendarDays size={17} /></button>
    </>}
  </span>;
}

export default function DateInput({ type = 'date', ...props }) {
  return type === 'date' ? <CalendarInput {...props} /> : <input {...props} type={type} />;
}
