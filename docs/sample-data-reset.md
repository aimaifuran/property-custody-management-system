Sample data was soft-deleted on 2026-10-14 with batch ID
`6acf17e3c09f7c169811820a` after confirmation that all form records were examples.

The original records remain in their collections with `deleted: true`,
`deletedAt`, and `deletionBatch`. Exact pre-reset documents, including balances
and relationships, are additionally retained in `sample_record_archives` under
the same batch ID. Accounts, settings, suppliers, and document/serial counters
were preserved. Restoring a batch must restore the complete linked workflow,
not individual balances in isolation.

From `backend`, `node soft-delete-samples.js` previews active record counts.
`node soft-delete-samples.js --apply` performs an atomic archive and soft delete.
Only use the apply command when all active form/stock records are confirmed
sample data. It is a maintenance command, not a server startup task.

Automatic monthly summaries may regenerate from the new active data. The
snapshot of the previous summary remains in the archive.
