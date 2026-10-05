import { FileDown, Pencil, Printer } from 'lucide-react';

const actions = {
  edit: { label: 'Edit', icon: Pencil },
  pdf: { label: 'PDF', icon: FileDown },
  print: { label: 'Print', icon: Printer },
};

export default function RecordActionButton({ action, title, ...props }) {
  const { label, icon: Icon } = actions[action];
  return (
    <button {...props} type="button" title={title || label} aria-label={title || label} className={`record-action record-action--${action}`}>
      <span className="record-action__label">{label}</span>
      <Icon className="record-action__icon" size={16} aria-hidden="true" />
    </button>
  );
}
