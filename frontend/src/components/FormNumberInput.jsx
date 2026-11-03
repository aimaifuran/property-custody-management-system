import { formNumber } from '../utils/formNumbers';

export default function FormNumberInput({ value, required, ...props }) {
  const display = formNumber(value);
  return <input {...props} value={display} required={required && !(value && !display)} />;
}
