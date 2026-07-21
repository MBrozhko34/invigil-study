# Task corpora

Format: one JSON file per task -- `{ id, prompt, entry_point, tests[] }`.
Tests are Python assert statements executed in the sandbox against the
candidate's namespace.

- `public/`  -- 60 tasks drawn from an established execution benchmark
  (imported at Stage A via your own script; verify license and record
  attribution in `public/ATTRIBUTION.md`). Three original samples are included
  here as format exemplars.
- `private/` -- 120 fresh tasks, generated + human-reviewed (`generator.py` in
  /reference-lab produces drafts). GITIGNORED. Their Merkle root is anchored
  on-chain at freeze; tasks are revealed 30 days post-publication and are
  SINGLE-USE (METHODOLOGY section 5.1) -- regenerate every leaderboard cycle.
