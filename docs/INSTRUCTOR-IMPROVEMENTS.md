# Property Accountability Management System — revised scope

The system manages the complete accountability lifecycle of properties handled by the Supply Office:

Registration → automated coding → categorization/specification → issuance and custodian assignment → PAR/ICS documentation → transfer → return → physical inventory → damaged/lost reporting → disposal → reports and history.

## Implemented in the Property Register

- Register an individual property with acquisition, supplier, fund, location, serial-number, quantity, and specification details.
- Generate a unique code automatically from the category and acquisition year.
- Search by code, name, serial number, category, or current custodian; filter by category and lifecycle status.
- Preserve the current custodian and a permanent accountability-history entry for registration, issue, transfer, return, physical inventory, damage/loss, and disposal actions.
- Record expected and physical counts during a physical inventory event.
- Retain records marked for disposal or disposed; records are not deleted.

## Existing related modules

The existing Property Card, PAR, ICS, PTR, and PRS modules remain available for form preparation, printing, and downloads. The Property Register is the operational source for the individual asset lifecycle; staff should use the same property code on related forms.

## Innovation to explain during defense

The innovation is an integrated accountability trail: each property has a system-generated identifier, live custodian status, searchable record, physical-count record, and chronological history. This replaces scattered manual checking with a single traceable property record. A future QR-code label can encode the generated property code, allowing a scanner to open the same record during physical inventory.

## Compliance statement

Use this wording in documentation: the system is **designed to align with applicable government property-accountability procedures** through property identification, custodian assignment, issuance/return/transfer records, physical inventory, disposal status, and audit history. Do not claim full COA compliance until the LGU verifies the current COA circulars, thresholds, and official forms that apply to it.

| Accountability procedure | System support |
| --- | --- |
| Property identification | Automated property coding |
| Custody | Current custodian and issue/transfer events |
| Physical inventory | Expected-versus-physical count event |
| Movement and return | Transfer and return history |
| Unserviceable property | Damaged/lost and disposal lifecycle statuses |
| Documentation | Property Card, PAR, ICS, PTR, and PRS modules |
| Historical record | Per-property accountability trail |
