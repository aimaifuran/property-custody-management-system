import { useId, useRef, useState } from 'react';
import { collectFormErrors } from '../utils/formValidation';

export default function ValidatedForm({ children, onSubmit, onChangeCapture, ref, validationSelector, as: Form = 'form', ...props }) {
  const [errors, setErrors] = useState([]);
  const attempted = useRef(false);
  const errorId = useId();

  const validate = form => {
    const nextErrors = collectFormErrors(form, validationSelector);
    const invalidFields = new Set(nextErrors.map(error => error.field));
    Array.from(form.elements).forEach(field => {
      if (!field.matches('input, select, textarea')) return;
      if (invalidFields.has(field)) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    });
    setErrors(nextErrors);
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
  }} aria-describedby={errors.length ? errorId : props['aria-describedby']}>
    <p className="form-required-hint mb-3 text-sm text-slate-500">Fields marked <span className="font-bold text-red-600">*</span> are required.</p>
    {errors.length > 0 && <div id={errorId} role="alert" className="form-validation-errors mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <p className="font-semibold">Form was not saved. Please complete or correct the highlighted fields.</p>
      <ul className="mt-2 list-inside list-disc">
        {errors.map(({ field, label, message }, index) => <li key={index}>
          <button type="button" className="text-left underline" onClick={() => field.focus()}>{label}: {message}</button>
        </li>)}
      </ul>
    </div>}
    {children}
  </Form>;
}
