export function collectFormErrors(form, selector) {
  return Array.from(form.elements).flatMap((field, index) => {
    if (selector && !field.matches(selector)) return [];
    if (!field.willValidate || field.matches(':disabled') || field.readOnly) return [];
    const blank = field.required && typeof field.value === 'string' && !field.value.trim();
    const nonpositive = field.dataset.positive === 'true' && !blank && Number(field.value) <= 0;
    if (!blank && !nonpositive && field.validity.valid) return [];
    const label = field.getAttribute('aria-label')
      || field.labels?.[0]?.querySelector('span')?.textContent?.trim()
      || field.getAttribute('placeholder')
      || field.labels?.[0]?.textContent?.trim()
      || `Field ${index + 1}`;
    const row = field.closest('tr');
    const rowNumber = row ? Array.from(row.parentElement.children).indexOf(row) + 1 : null;
    const section = field.parentElement?.closest('fieldset, .rounded-xl')?.querySelector('h3')?.textContent?.trim();
    const displayLabel = `${section ? `${section}: ` : ''}${label}${rowNumber ? ` (row ${rowNumber})` : ''}`;
    return [{ field, label: displayLabel, message: blank ? 'This field is required.' : nonpositive ? 'Enter a number greater than zero.' : field.validationMessage }];
  });
}
