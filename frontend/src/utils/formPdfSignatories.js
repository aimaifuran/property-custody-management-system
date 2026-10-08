// Format printed signatures without changing the saved account/form values.
export const signatoryText = value => String(value && typeof value === 'object' ? value.name || '' : value ?? '').toUpperCase();

export const isFormSignatoryField = key => /^(?:(?:requestedBy|approvedBy|issuedBy|receivedBy|receivedFrom|returnedBy|returnedTo)(?:(?:Name|Designation|Position|Date)\d?)?|inspectedBy|acceptedBy|inspectionDate|acceptanceDate)$/.test(key);
