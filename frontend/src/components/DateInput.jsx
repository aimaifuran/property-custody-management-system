import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { displayDate, parseDisplayDate } from '../utils/dateInput';

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2024, month, 1)));
const isoDate = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const dateParts = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : null;
};

function CalendarDropdown({ label, value, options, onChange, open, onToggle, className = '' }) {
  const selectedOption = useRef(null);
  useEffect(() => {
    if (open) selectedOption.current?.scrollIntoView({ block: 'nearest' });
  }, [open, value]);
  const currentLabel = options.find(option => option.value === value)?.label || '';
  return <div className={`relative min-w-0 ${className}`}>
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={onToggle}
      className="flex w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold hover:bg-slate-50">
      <span className="truncate">{currentLabel}</span><ChevronDown size={14} className="shrink-0 text-slate-500" />
    </button>
    {open && <div role="listbox" aria-label={label} className="absolute left-0 top-[calc(100%+4px)] z-[120] max-h-32 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {options.map(option => <button key={option.value} ref={option.value === value ? selectedOption : undefined} type="button" role="option" aria-selected={option.value === value}
        onClick={() => { onChange(option.value); onToggle(); }}
        className={`block w-full truncate px-2 py-1.5 text-left text-sm ${option.value === value ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-700 hover:bg-slate-50'}`}>{option.label}</button>)}
    </div>}
  </div>;
}

function CalendarInput({ value = '', onChange, className = '', readOnly, disabled, ...props }) {
  const [text, setText] = useState(() => displayDate(value));
  const [open, setOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState('');
  const [anchor, setAnchor] = useState(null);
  const selectedDate = dateParts(value);
  const now = new Date();
  const [view, setView] = useState(() => selectedDate || { year: now.getFullYear(), month: now.getMonth() });
  const root = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);

  useEffect(() => { setText(displayDate(value)); }, [value]);
  useEffect(() => {
    input.current?.setCustomValidity(text && !parseDisplayDate(text) ? 'Enter a valid date in MM/DD/YYYY format.' : '');
  }, [text]);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => {
      if (root.current?.contains(event.target) || panel.current?.contains(event.target)) return;
      setOpen(false);
      setOpenPicker('');
    };
    const keyboard = event => { if (event.key === 'Escape') { setOpen(false); setOpenPicker(''); } };
    const reposition = () => {
      if (root.current) setAnchor(root.current.getBoundingClientRect());
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const currentYear = new Date().getFullYear();
  const maximumYear = Math.min(dateParts(props.max)?.year ?? currentYear, currentYear);
  const years = useMemo(() => {
    const first = Math.min(dateParts(props.min)?.year ?? maximumYear - 100, maximumYear);
    return Array.from({ length: maximumYear - first + 1 }, (_, index) => ({ value: first + index, label: String(first + index) }));
  }, [props.min, maximumYear]);
  const months = MONTHS.map((month, index) => ({ value: index, label: month }));
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const emit = (event, nextText, nextIsoDate) => {
    setText(nextText);
    if (!nextText || nextIsoDate) onChange?.({ ...event, target: { ...event?.target, name: props.name, value: nextIsoDate || '' }, currentTarget: { ...event?.currentTarget, value: nextIsoDate || '' } });
  };
  const openCalendar = () => {
    if (!root.current) return;
    const rect = root.current.getBoundingClientRect();
    setAnchor(rect);
    const date = dateParts(value);
    setView(date ? { year: Math.min(date.year, maximumYear), month: date.month } : { year: maximumYear, month: new Date().getMonth() });
    if (open) setOpenPicker('');
    setOpen(!open);
  };
  const chooseDay = day => {
    const next = isoDate(view.year, view.month, day);
    emit(null, displayDate(next), next);
    setOpen(false);
    setOpenPicker('');
  };
  const shiftMonth = offset => {
    const date = new Date(view.year, view.month + offset, 1);
    if (date.getFullYear() > maximumYear) return;
    setView({ year: date.getFullYear(), month: date.getMonth() });
  };
  const popoverHeight = 300;
  const popoverWidth = 272;
  const popoverTop = anchor ? (anchor.bottom + popoverHeight + 4 <= window.innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - popoverHeight - 4)) : 0;

  return <span ref={root} className="relative block w-full">
    <input {...props} ref={input} type="text" inputMode="numeric" placeholder="MM/DD/YYYY" maxLength={10}
      value={text} readOnly={readOnly} disabled={disabled} className={`${className} pr-10`}
      onChange={event => emit(event, event.target.value, parseDisplayDate(event.target.value))} />
    {!readOnly && <button type="button" disabled={disabled} aria-label={`Choose ${props['aria-label'] || 'date'}`} aria-expanded={open}
      className="absolute inset-y-0 right-2 flex items-center px-1 text-slate-600 disabled:cursor-not-allowed disabled:opacity-60" onClick={openCalendar}><CalendarDays size={17} /></button>}
    {open && anchor && createPortal(<div ref={panel} role="dialog" aria-label="Choose date" className="date-picker-popover fixed z-[110] w-[272px] rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl"
      style={{ left: Math.max(8, Math.min(anchor.right - popoverWidth, window.innerWidth - popoverWidth - 8)), top: popoverTop }}>
      <div className="relative mb-2 flex items-center gap-1">
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="rounded-md p-1.5 hover:bg-slate-100"><ChevronLeft size={16} /></button>
        <CalendarDropdown label="Month" value={view.month} options={months} className="flex-1"
          open={openPicker === 'month'} onToggle={() => setOpenPicker(current => current === 'month' ? '' : 'month')}
          onChange={month => setView(previous => ({ ...previous, month }))} />
        <CalendarDropdown label="Year" value={view.year} options={years} className="w-[76px] shrink-0"
          open={openPicker === 'year'} onToggle={() => setOpenPicker(current => current === 'year' ? '' : 'year')}
          onChange={year => setView(previous => ({ ...previous, year }))} />
        <button type="button" aria-label="Next month" disabled={view.year === maximumYear && view.month === 11} onClick={() => shiftMonth(1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="py-1.5">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const dateValue = isoDate(view.year, view.month, day);
          const selected = selectedDate?.year === view.year && selectedDate?.month === view.month && selectedDate?.day === day;
          const outsideRange = Boolean((props.min && dateValue < props.min) || (props.max && dateValue > props.max));
          return <button key={dateValue} type="button" disabled={outsideRange} aria-label={dateValue} aria-pressed={selected} onClick={() => chooseDay(day)}
            className={`mx-auto grid h-8 w-8 place-items-center rounded-full transition ${selected ? 'bg-teal-700 font-semibold text-white' : 'hover:bg-teal-50'} disabled:cursor-not-allowed disabled:text-slate-300`}>{day}</button>;
        })}
      </div>
    </div>, document.body)}
  </span>;
}

export default function DateInput({ type = 'date', ...props }) {
  return type === 'date' ? <CalendarInput {...props} /> : <input {...props} type={type} />;
}
