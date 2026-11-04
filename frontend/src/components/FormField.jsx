import { Children } from 'react';

export default function FormField({ children, className = '', ...props }) {
  const [caption, ...controls] = Children.toArray(children);
  return <label {...props} className={`form-field ${className}`}>
    <fieldset className="form-field__outline">
      <legend>{caption}</legend>
      <div className="form-field__control">{controls}</div>
    </fieldset>
  </label>;
}
