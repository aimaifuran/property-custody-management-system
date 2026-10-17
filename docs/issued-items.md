# Issued Items

Admins open **Issue > Requisition and Issue Slip > Issued Items** to browse current holders grouped by item
name. Search matches item names, categories, recipient names, offices, serials,
property numbers and document numbers. Category and item selectors narrow the
list. Each holder shows outstanding quantity, unit identities and RIS links.

The admin-only `/api/ris/issued-items` endpoint includes issued supplies and
assets from finalized RIS documents. Assets follow the current accountability
owner after transfer; remaining quantities use the accountability's recorded
returns. Supplies subtract confirmed PRS and standalone returned-supply entries.
Pending returns do not remove a holder; fully returned items disappear.
Offline recipients are included. No new inventory postings are created here.

Saving IAR posts receipt stock and Property Card data without reserving a RIS
number or creating a request. The RIS screen is labeled Requests.

On 2026-10-14, two untouched automatic receipt drafts were soft-deleted with
archive batch `6acf23e6140cf1b12ac21e8f`. Original snapshots remain in
`sample_record_archives`. The maintenance command
`node archive-receipt-drafts.js` (from backend) previews qualifying drafts;
`--apply` archives them transactionally. Edited drafts and actual requests are
excluded by the filter.
