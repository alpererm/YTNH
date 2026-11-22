# Portable master — Stage 5 cleanup and Stages 6–7 audit

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

15 November 2026. User authorized proceeding through the remaining stages without
individual approval stops. No commit, push, release or installed-app replacement was
performed. Synthetic evidence only; no user library was modified.

## Status

- Stage 5: safe creation-path cleanup completed; full legacy retirement remains incomplete.
- Stage 6: targeted source review, native fault-injection regression and new synthetic
  corruption/status probes completed within the available macOS environment.
- Stage 7: dependency review and full available core regressions completed. Remaining live
  legacy dependencies are documented below, not misrepresented as removed.
- Windows and real two-computer transfer remain unverified. This is not release acceptance.

The original requirement to retire only verified-obsolete components still matters:
permission to proceed is not evidence that the replacement is verified on Windows or that
existing legacy library access has become unused. Do not strand unconverted libraries.

## Stage 5 changes

1. Removed `New handoff library…` and its frontend handler. Removed the menu toggle's
   obsolete reference. New file continues to use `portable_new`.
2. Removed the native `create` dispatch arm. The old Store::create helper is compiled ONLY
   under `cfg(test)` to construct synthetic legacy fixtures for existing recovery/image
   tests. It is no longer in a production build or callable through the native bridge.
3. Extended `tests/portable-desktop.cjs` to verify the removed command is absent even in a
   legacy-library menu, conversion remains present, cancelled New preserves the current
   document/selection, and successful New uses the portable operation only.

No schema, library content, source files, backup history or existing-library handlers were
removed. No tests/gates were weakened to allow retirement.

## Stage 6 findings

### PM-01 — Recovery list incorrectly labels a published copy as unpublished (fixed)

Severity: medium, recovery UI correctness; not data loss.

Evidence: create/load a synthetic master; edit locally; publish successfully. Direct
`recover()` reports unpublished=false, but `recovery_copies()` previously returned true.
Generation `copies/<UUID>/session.json` intentionally preserves the initial activation
receipt. The active `sessions/<library>.json` contains subsequent publication progress.
The listing compared the current head against the original receipt's base instead of the
active session, also showing an outdated master filename after Save As.

Correction: `crates/library/src/portable.rs`, `WorkingStore::recovery_copies`, now uses
active session metadata only when its copy ID matches that exact generation. Retired
copy receipts are unchanged. No stored receipt, revision, data or pointer is rewritten by
listing. New edits still appear unpublished. Read-only calculation only.

Permanent regression:
`portable::publication::tests::recovery_listing_uses_active_publication_without_rewriting_receipts`
checks pending edits, publication, Save As destination, later edits and byte-identical
retained receipts. Full shared/native suites pass after the correction.

### PM-02 — One invalid retained receipt blocks the full recovery list (open)

Severity: medium, recovery availability; fails closed rather than overwriting data.

Reproduction with disposable stores: create a valid portable copy, then place a separate
UUID-named directory containing a malformed `session.json` under `copies`. Calling
`recovery_copies()` returns the JSON error for the whole operation. A first activation
also fails when its orphan-protection scan encounters the unreadable record. An existing
active library remains directly recoverable through its valid active session.

Evidence directory:
`/tmp/ytnh-audit-652e5e9e-b4ee-436f-9626-33d2d8865e9d`
Probe source: `/tmp/ytnh-stage6-probe/src/main.rs`
Pre-correction probe output: `/tmp/ytnh-stage6-probe.log`
The probe contains the original PM-01 failure assertion and is historical reproduction,
not a current passing regression test. PM-01's permanent regression supersedes it.

Root cause: error propagation inside `WorkingStore::recovery_copies` aborts enumeration;
`load` depends on that enumeration to protect unregistered local edits. The native
`portable_recovery_list` command cannot display unaffected copies alongside errors.

Recommended correction: return validated copies AND explicit per-entry diagnostics to the
recovery UI. Allow explicit recovery of verified entries. Keep activation safeguards for
unreadable records whose library ownership cannot be established. Do not silently skip
unknown receipts, auto-repair, delete, quarantine or assume they contain no unpublished
work. This broader recovery-flow correction was not mixed into the cleanup. Files remain
intact and no loss/corruption was observed in the probe.

### PM-03 — Cross-platform durability and acceptance gap (open)

Severity: high release-verification gap, not a demonstrated implementation defect.

Windows replacement/locking, installer execution, native dialogs, failed-close UI and
cloud-only file behavior remain untested. POSIX directory fsync does not certify Windows
filesystem durability. Mac package startup is not full native UI acceptance. Use
`WINDOWS-PORTABLE-ACCEPTANCE.md`; do not mark Windows passed.

### PM-04 — Retained storage growth / large-library resource use (known limit)

Publication candidates, previous masters, generation copies and backups are retained.
Their growth is deliberate pending a safe retention policy. No automatic deletion was
introduced. Streaming package checks bound ZIP metadata and bytes, but existing semantic
validators still load the model/archive content into memory. Large-library acceptance and
storage-growth measurement remain outstanding; configured limits are not performance proof.

### PM-05 — Noncooperating filesystem writer race (known limit)

`publish` checks the destination before staging, immediately before replacement and again
after replacement. It preserves the previous master and a durable candidate/receipt. These
checks do not provide a cross-process/cloud-provider compare-and-swap primitive. A writer
can act between the last comparison and rename. Sequential device use and completed cloud
synchronization remain essential. No cloud-completion claim or polling was added.

## Verified safety coverage

Existing real-file/SQLite tests cover: complete archive/image packages, exact revision
manifest, checksum/format/entry limits, traversal/symlinks, missing/semantic-corrupt assets,
exclusive store ownership, stale/divergent revisions, unpublished local work, failed
activation, failed writes at candidate/pending/before-replace/replaced/recorded checkpoints,
changed candidate, last-check external change, simultaneous local change, missing/read-only
master, Save As and interrupted-publication recognition without losing later edits.

Host tests retain current/Preview source preservation and catalog-pointer failure guards.
Browser simulations cover local-only autosave, close retry/cancellation/Save As, local-write
failure, caret/undo and explicit recovery. They do not simulate an actual Windows filesystem.

## Stage 7 dependency inventory and retirement decision

| Component | Current callers / purpose | Decision |
|---|---|---|
| New handoff menu/native create | No remaining production caller | Removed; fixture helper test-only |
| scheduleSnapshot, idle setting, publishSnapshot | Unconverted LibraryHandle saves/reopen/close | Retained live compatibility; portable guard prevents use |
| receiveCode, openAutomatic/verifyAutomatic, connect/prepare/resume | Existing library entry, recovery exports, manual handoff | Retained pending safe legacy-to-portable transition |
| Native inspect/receive/gate/allow_local/reverify_current | Those existing-library flows and conflict/revision safeguards | Retained, portable entries explicitly reject them |
| transfer archive_names/verify_archive/stage_archives/immutable | Portable packaging, exports, archives, backups, source conversion | Shared safety infrastructure; must not delete by module name |
| Repository revision_info/descends_from | Portable exact snapshots and stale/divergent protection | Retained |
| lifecycle migrate/export_recovery | Existing recovery-export restoration and complete export | Retained; migration name does not make recovery obsolete |
| lifecycle backup/backup_retained | Legacy/portable backups and restore | Retained; no retention policy change |
| Legacy catalog/source metadata and original objects | Explicit conversion, source retention, older backups | Retained on disk; no schema migration/deletion |
| Handoff cross-platform CI chain and regression scripts | Still-reachable legacy workflows | Retained; not replaced with weaker/no checks |

There is no provider SDK or new provider API. Portable scheduling already bypasses the
old snapshot timer; this cleanup does not claim to have removed that timer for legacy
libraries. The portable model uses local ordinary-file operations and the existing save
queue. No editor/Outline/Planner refactor was performed.

Full removal requires a designed, tested conversion-only path for old catalog/recovery
entries, including cancellation, unavailable original assets, paused libraries and failed
conversion. Removing active handlers before that transition is not a safe dead-code cleanup.

## Actual verification

- Shared library: **48 passed**, 0 failed (14 unit, 1 image-format, 22 portable, 11 repository).
- Desktop-native, image-enabled: **20 passed**, 0 failed; one existing growth diagnostic ignored.
- Complete core runner: **59 passed**, 0 failed (Chromium/Helium and WebKit plus Planner model).
- Production Rust `cargo check` with image feature: passed after endpoint retirement.
- Workflow safety contracts: passed; 4,096 prerequisite combinations and deliberate
  bypass/bootstrap regressions correctly rejected.
- `git diff --check`: passed.

Logs: `/tmp/ytnh-final-library.log`, `/tmp/ytnh-final-native.log`,
`/tmp/ytnh-final-core.log`, `/tmp/ytnh-final-check.log`.
The complete browser run covers final frontend changes; the subsequent PM-01 change is
Rust-only and shared/desktop-native suites were rerun after it. No app package was rebuilt.

## Rollback and next work

Changes remain uncommitted alongside Stages 2–3. Do not use a blanket Git reset: it would
remove earlier approved work. The Stage 5 delta is the menu/dispatch removal and test-only
helper annotation; PM-01 is the local read-only listing change plus its regression.
Neither requires database rollback.

Next reliability correction: PM-02's explicit partial-recovery reporting, preserving
fail-closed activation. Next acceptance requirement: actual Windows run and cross-computer
master exchange. Next retirement work: conversion-only compatibility path. Broad legacy
retirement and release readiness are NOT complete, despite passing available regressions.
