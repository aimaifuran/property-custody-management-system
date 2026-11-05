const officeDivisions = {
  DILG: "Mayor's Office",
  'Department of Interior & Local Government': "Mayor's Office",
  DTI: "Mayor's Office",
  'Department of Trade and Industry': "Mayor's Office",
  'Tourism Office': "Mayor's Office",
  'Business Permit and Licensing Office': "Mayor's Office",
  CATEMO: 'Municipal Administrator',
  'Carigara Traffic Enforcer and Management Office': 'Municipal Administrator',
  'Person with Disability': 'Municipal Social Welfare and Development',
  'Person with Disability Affairs Office': 'Municipal Social Welfare and Development',
  "Senior's Office": 'Municipal Social Welfare and Development',
  'Market and Slaughter House': 'Municipal Treasurer',
  'Supply Office': 'Municipal Treasurer',
  Philhealth: 'Municipal Health Office',
  'Philippine Health Insurance Corporation': 'Municipal Health Office',
};

export const isMayorOffice = office => /^mayor(?:'s|’s)? office$/i.test(String(office || '').trim());
export const isMayorOfficeName = office => /^mayor(?:'s|\u2019s)? office$/i.test(String(office || '').trim());
export const hasNoDivision = office => isMayorOfficeName(office) || /^(municipal administrator|municipal social welfare and development|municipal treasurer|municipal health)(?: office)?$/i.test(String(office || '').trim());
export const divisionForOffice = office => hasNoDivision(office) ? '' : officeDivisions[office] ?? '';
export const motherOfficeForOffice = office => divisionForOffice(office);
