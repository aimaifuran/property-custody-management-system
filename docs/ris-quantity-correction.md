# Legacy quantity correction

The old RIS editor kept actual issued quantity at one after requested quantity
was increased. New requests now synchronize the proposed actual quantity with
the requested quantity and available stock. Issuance allocates each serialized
unit separately in one transaction.

`node complete-ris-quantity.js --ris DOCUMENT_NUMBER` previews completion of a
specific legacy under-issued request. `--apply` completes only the missing
quantity using available units. Use only for an explicitly confirmed full
issuance; intentionally partial issues must remain unchanged.

Completion preserves existing inventory/accountability/document links, appends
new unit lines under the same RIS, generates linked ICS/PAR for additional
assets, records outgoing stock entries and an audit log, and snapshots the
original RIS and stock in `sample_record_archives`. Requested totals remain
unchanged. Returned or transferred original assets are excluded from completion.
The maintenance command suppresses notifications and email delivery and refreshes
derived monthly reports. Repeating the same completed line is rejected.

On 2026-10-14, RIS 2026-10-032 was completed from 1 issued unit to its requested
6 units. Five additional units were posted. A concurrent RIS 2026-10-033 had
issued 10 units, so stock changed from 7 to 2 during the correction. Verification
showed 20 received, 18 issued, zero returned, and 2 available with no ledger
mismatch. RIS 2026-10-031 remains at its recorded 1 issued unit pending
confirmation of whether its request for 10 was intentionally partially issued.
