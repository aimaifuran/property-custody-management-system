# Record reset

The local pcms database was reset on October 30, 2026 (Asia/Manila).
Archive batch: `6ae4a772041d3c066a7c746a`.
Backup: `backend/backups/record-reset-1793369970541.json` (private, ignored by Git).

Active IAR, Property Card, RIS, ICS, PAR, PTR, PRS, returned supply,
inventory, property, accountability, ledger, item, PPE records, notifications,
activity history, and workflow email queue were cleared. Original documents
are archived in `sample_record_archives`. User accounts, profile photos,
settings, suppliers, offline recipients, and identity counters were preserved.
The reset verified zero active records and unchanged protected collections.

The deployed database for https://pams-lgu-carigara.vercel.app was reset on
October 30, 2026 (Asia/Manila). Archive batch: `6ae4b178555be7879092be98`.
Backup: `backend/backups/record-reset-1793372535565.json` (private, ignored by Git).
All active reset targets were verified empty; protected accounts and settings
were verified unchanged. MongoDB service discovery used DNS over HTTPS because
the system DNS resolver refused the Atlas SRV lookup. No credentials were changed.

## Maintenance command

Run from backend:

```powershell
node reset-records.js
node reset-records.js --apply
```

For a separate database, use an ignored environment file containing
`MONGODB_URI` and review the preview before applying:

```powershell
node reset-records.js --env-file .env.production.local
node reset-records.js --env-file .env.production.local --apply
```

Apply saves a private Extended JSON backup, archives the linked workflow in
one database transaction, and verifies the result. Do not seed sample records
after resetting. Restore linked workflows as a whole batch, never isolated
stock balances. This command preserves document counters to avoid reusing IDs.
