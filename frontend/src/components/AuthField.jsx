import { Children } from 'react';

export default function AuthField({ children, className = '', ...props }) {
  const [caption, ...controls] = Children.toArray(children);
  return <label {...props} className={`auth-field ${className}`}>
    <fieldset className="auth-field__outline">
      <legend>{caption}</legend>
      <div className="auth-field__control">{controls}</div>
    </fieldset>
  </label>;
}
