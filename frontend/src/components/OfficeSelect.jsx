const OFFICE_OPTIONS = [
  "Mayor's Office",
  'Municipal Administrator Office',
  'Municipal Budget Office',
  'Municipal Accounting Office',
  'Municipal Planning and Development Office',
  'Municipal Engineering Office',
  'Municipal Social Welfare and Development Office',
  'Municipal Civil Registrar Office',
  'Human Resource and Management Office',
  'Municipal Treasurer Office',
  'Municipal Assessor Office',
  'Sangguniang Bayan Office',
  'Municipal Disaster Risk Reduction and Management Office',
  'Municipal Agriculture Office',
  'Municipal Health Office',
  'Supply Office',
  'Department of Interior & Local Government',
  'Business Permit and Licensing Office',
  'Department of Trade and Industry',
  'Carigara Traffic Enforcer and Management Office',
  'Person with Disability Affairs Office',
  "Senior's Office",
  'Market and Slaughter House',
  'Philippine Health Insurance Corporation',
  'Tourism Office',
];

export default function OfficeSelect({ value = '', readOnly = false, className = '', ...props }) {
  return <select {...props} className={`office-select ${className}`} value={value} disabled={readOnly || props.disabled}>
    <option value="">Select office</option>
    {value && !OFFICE_OPTIONS.includes(value) && <option value={value}>{value}</option>}
    {OFFICE_OPTIONS.map(office => <option key={office} value={office}>{office}</option>)}
  </select>;
}
