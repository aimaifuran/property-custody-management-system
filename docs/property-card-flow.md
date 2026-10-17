# Property Card inventory ledger

The main Property Card screen identifies stock by `Item._id` and `stockNumber`. It reads all receipt inventories for that item and their existing `LedgerTransaction` records. It does not add together Property Card snapshots and ledger movements. New PropertyCard documents use a unique sparse `stockItem` index and accumulate successive accepted receipts. Existing legacy cards are preserved; no destructive migration or guessed historical document links runs.

## Relationships

- IAR line -> Inventory -> Item. `acceptedQuantity` is stored separately from delivered quantity. Only accepted units enter Inventory and the ledger. Receiving stock never creates a RIS draft; requests are created separately.
- Ledger -> Inventory and explicit source document/line IDs. New postings carry a unique `sourceKey`, posting user and timestamp. Older rows resolve a source only when its type and reference uniquely match a real linked document.
- RIS line -> exact Inventory where selected, Property and serial number. Stock is posted transactionally using explicit actual issued quantities. A missing actual quantity is rejected. ICS/PAR reference this issuance without a second stock deduction.
- PTR -> existing accountability/inventory. Only approved custody transfers or finalized recorded PTRs enter the item history, with zero receipt/issue quantity. Existing confirmation and approval still control custody reassignment.
- PRS -> original RIS line/accountability. Only serviceable accepted returns increase stock; unserviceable returns appear as zero-stock events.

## Screen and exports

The item list supports search, category/status filters and server-side pagination. Summary counts come from real items. Low-stock status uses `Item.reorderLevel` only when configured; absent thresholds are shown as not configured. Details show item information, stock totals, chronological balances, date/type/office filters and real related-document links. `?record=<id>` opens the linked form using its existing permissions.

The existing approved Property Card PDF template and print implementation are reused. Both receive the same selected-item rows, period opening balance and ending balance. Filtering by type or office hides transactions without recalculating their historical running balances.

## Posting safeguards

IAR Save is the existing finalized receipt action; a request explicitly marked draft or rejected cannot post stock. A new-form submission UUID prevents retrying the same receipt from creating another posting. A separate stock code is required for incompatible units or classifications. Posted receipt quantities and serial identities remain locked; corrections require a reversal/adjustment process, not an overwritten balance.

RIS/PRS postings and stock changes use MongoDB transactions and existing workflow locks. Ledger source keys prevent duplicate source-line postings. Concurrent stock decrements remain conditional on sufficient stock. ICS/PAR and PTR do not create a second deduction.

RIS has a separate Item column with distinct available item names. Selecting a name retains an available unit's serial/property identity internally. Requested and actual quantities are editable, including quantities greater than one. Approval/issuance expands a multi-unit serialized request into distinct available unit lines in the same stock transaction, preserving total requested and actual quantities. Each issued unit keeps its own valuation, accountability and return links. Insufficient available units reject the issuance without a partial deduction. Selecting stock does not issue it: approval/issuance commits the deduction. Issued units disappear from available choices, serviceable inspected returns restore the same unit, and unserviceable returns never restore requestable stock. Availability refreshes when the editor opens and when the window regains focus. The RIS editor does not include Source IAR or the introductory instruction box. Official PDF and print templates are unchanged.

The Property Card activity table starts empty until an actual issuance exists.
IAR receipts continue to supply stock totals and historical balances but are not
displayed as one activity row per received unit. Issuance, return and transfer
activity is grouped by source document and recipient/office, retaining all unit
IDs and serials. Quantities and amounts are summed; the final historical stock
balance is retained. PDF/print use the same activity selection and the Appendix
69 layout. Receipt-only cards export a blank transaction grid.

## Limits and historical records

There is no approved adjustment/reversal workflow or draft-IAR posting screen in this project, so neither is invented here. Draft/rejected IAR submission is blocked rather than treated as accepted stock. Reorder thresholds have no invented defaults. Initial stock predating recorded ledger rows is carried as an opening balance derived from existing records. A ledger/available-stock mismatch is displayed for review and is never silently overwritten. Legacy cards remain accessible to compatibility/reporting code; new item-level views combine their underlying real stock ledgers without duplicating movements.

The current list endpoint returns paginated results but loads matching item metadata to calculate summary counts; very large installations may benefit from moving those counts to database aggregation. No production data is seeded or migrated by this implementation.

## Selecting items on receipt

IAR Property, Plant and Equipment has a searchable stock-item dropdown backed by the same Item records as Property Card. The dropdown shows distinct item names only. Selecting a name retains its underlying stock code, unit and classification for grouping; descriptions, costs and individual serial/property numbers are entered separately. A new item name requires a new stock code. New accepted deliveries add to the existing stock-item ledger without a second Item record.

Changing quantity never adds IAR table rows, including after saving or reopening. The original delivery line is preserved; accepted assets receive distinct inventory/property records behind the form, with an inventory-ID array linking all units to that line. Add Row is the only way to add a displayed line. The IAR serial field holds the administrator-entered base with no configured character limit. Each accepted unit, including a supply unit when a base is entered, receives a generated serial with a numbered suffix (for example 45241-1 through 45241-10). Reusing a base continues its counter. Counters use the existing DocumentSequence collection and the same transaction as receipt posting. Units without a serial receive a unique generated property number where applicable. Supply quantities remain grouped. Existing historical batch records are preserved. RIS unit choices include these property-numbered assets, and the issuance validation prevents the same individual unit from being assigned twice.
