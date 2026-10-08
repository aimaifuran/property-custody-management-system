# Linked RIS issuance

IAR receives stock and creates a Property Card and RIS draft. New IARs do not create ICS/PAR before issuance. Existing historical documents remain intact.

User requests retain the signed-in user ID in `requestedBy.user`. After admin review/approval, `POST /api/ris/:id/issue` first separates consumable supplies (`Item.itemType = SUPPLY`) from assets. Supplies deduct stock and post ledger/Property Card entries without creating ICS/PAR or asset accountability. For assets, the inventory unit cost determines the form: below PHP 50,000 goes to ICS; PHP 50,000 or higher goes to PAR. Quantity multiplied by unit cost does not change this classification. A mixed RIS creates both forms, one per type, containing only the corresponding items.

The editor's Approved button saves edits and calls `POST /api/ris/:id/approve`, which now finalizes approval and issuance in the same transaction. Items immediately become available in the user's return page and the admin PRS dropdown. Repeat approvals do not deduct stock again. Approval fails without changing stock or status if inventory cannot fulfill the issuance. An unreviewed request with no entered issued quantity uses its requested quantity; reviewed zero-quantity rows remain unissued.

RIS links the generated forms; each item links its accountability, form ID, type, number and unit cost. ICS/PAR and accountability records link the requesting account by user ID. The requester owns the issuance even if a different received-by name was entered. Names may change without breaking account ownership. Requesters whose names cannot be uniquely linked must be assigned an account before issuance.

The issuance transaction creates official forms for assets, deducts stock, posts outgoing ledger/Property Card entries and updates RIS accountability together. Repeated/concurrent issuance cannot issue the same RIS twice. Failed issuance rolls back all writes. My Issued Items exposes the linked ICS/PAR number alongside RIS number.

`GET /api/ris/my-items` shows all records owned by the signed-in account immediately after admin save, including pending, reviewed, approved and rejected requests. Requested quantities and actual issued quantities are separate; planned quantities remain zero in the issued column until issuance. `GET /api/ris/my-returns` continues to show only actual issuances eligible for the return workflow. Admin saves reject requested-by names that cannot be linked to an account; explicit account selection resolves duplicate names.

## Database setup

MongoDB must support transactions: a replica set (including a single-node local replica set) or a sharded cluster/Atlas. A standalone configured database is rejected before any writes. Set `MONGODB_URI` to the transaction-capable database. Do not change a production database configuration without confirming the intended environment. The development in-memory fallback uses a single-node replica set.

The additional schema fields are optional, so legacy forms remain readable. Old issuances are not backfilled or reissued automatically. No existing database records are migrated or deleted by this change.

Local Windows setup uses replica set `pcms-rs`, with member `localhost:27017` and the existing MongoDB Windows service/data directory. The local backend URI includes `replicaSet=pcms-rs`. Local `.env` and setup/configuration backup files remain excluded from Git. Transaction reads against the existing `pcms` database were verified after conversion.

User acceptance, transfer approval and inspected returns are described in [custody-workflow.md](custody-workflow.md).
