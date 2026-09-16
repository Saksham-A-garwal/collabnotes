-- Tracks the last document_updates.id folded into each snapshot, so
-- hydration (persistence.ts) only replays updates *after* the snapshot
-- instead of the entire history. This is what makes restore (FR-23b, FR-25)
-- actually stick: a restore writes a new snapshot whose cutoff is the
-- current max update id, so the abandoned updates between the old and new
-- state are still never deleted (SRS §6 compaction note) but are simply
-- skipped by every future hydration. Nullable because the compaction job
-- may not have run yet for a given snapshot's document.
ALTER TABLE document_snapshots
  ADD COLUMN last_update_id BIGINT;
