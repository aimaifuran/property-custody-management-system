import { useRef } from 'react';
import { collectFormErrors } from '../utils/formValidation';

export default function ValidatedForm({ children, onSubmit, onChangeCapture, ref, validationSelector, as: Form = 'form', ...props }) {
  const attempted = useRef(false);

  const validate = form => {
    const nextErrors = collectFormErrors(form, validationSelector);
    const invalidFields = new Set(nextErrors.map(error => error.field));
    Array.from(form.elements).forEach(field => {
      if (!field.matches('input, select, textarea')) return;
      if (invalidFields.has(field)) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    });
    return nextErrors;
  };

  return <Form {...props} ref={ref} noValidate onSubmit={event => {
    attempted.current = true;
    const invalid = validate(event.currentTarget);
    if (invalid.length) {
      event.preventDefault();
      event.stopPropagation();
      invalid[0].field.focus();
      return;
    }
    onSubmit?.(event);
  }} onChangeCapture={event => {
    onChangeCapture?.(event);
    if (attempted.current) validate(event.currentTarget);
  }}>
    {children}
  </Form>;
}
