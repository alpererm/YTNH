# Portable master — Stage 3 implementation

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

Stage 3 connects the Stage 2 container/local-copy APIs to the existing application.
No real library has been opened, converted or modified during implementation. No installed
application, release version, application identity or packaging configuration was changed.
No commit, push or release was performed.

## User workflow

- **New file** creates a new `.ytnh` master and activates its local SQLite copy.
- **Open file** selects a `.ytnh` master. Recent files and startup reopen its remembered
  device-local path, verify the master and protect unpublished local edits.
- Autosave keeps using the existing serialized local SQLite queue and 2/15-second timing.
- **Save** and normal **Close** flush Editor/local writes, then publish a verified master.
- **Save master as…** selects a NEW filename. Existing destinations are never overwritten
  by Save As, even if a native picker offers an overwrite prompt.
- Switching away from a portable library first saves it; cancellation keeps it open.
- **Convert this library to portable file…** converts a currently verified legacy library.
- **Convert existing SQLite library…** supports an older main/Preview managed library.
  The other owning application must be closed; its local writer lock is acquired during
  conversion. Original SQLite, catalog, JSON originals, assets and handoffs are retained.
- **Recover local portable library…** lists retained copies for explicit selection.
  Nothing is chosen by timestamp. A different dirty current copy blocks replacement.

Portable-mode status distinguishes local saving from pending or completed master saving.
A locally saved master is not a claim that cloud synchronization has finished.

The existing handoff workflow remains available for legacy libraries. Its actions and
idle snapshot preference are hidden for portable libraries; native guards also prevent
handoff operations on a portable library. No legacy code was retired in this stage.

## Publication and crash recovery

`crates/library/src/portable/publication.rs`:

1. Check the local revision and opened master fingerprint.
2. Create a complete verified candidate under durable local `publications/<UUID>/`.
3. Persist a receipt identifying previous session, candidate checksum/revision, destination
   and expected prior fingerprint. Persist the active pending-publication pointer.
4. Preserve the previous master locally, copy the candidate to same-directory staging,
   flush and verify staging, and recheck the local revision and destination fingerprint.
5. Rename/replace the master without a truncate/copy-over fallback; verify the final file.
6. Record publication success locally. Candidates, previous masters and receipts remain
   retained; no new automatic recovery-file deletion policy has been introduced.

On restart/retry, an exact verified destination matching the pending receipt proves the
local replacement succeeded. Its published revision can be recorded without discarding
subsequent local edits. Missing, different or unverified files are never treated as success.

Failed master writes offer Retry, Save As and Cancel Close. If the preceding local SQLite
write itself fails, pending in-memory edits remain and Retry/Cancel are offered; Save As
is not misleadingly offered before a consistent snapshot can be produced. Existing
emergency recovery export remains available after cancelling close.

No-change Save checks the destination but does not rewrite it. A previously existing,
now-missing master is not silently recreated. Read-only masters and conflicting writes
are rejected. Save As reconnects only after successful verification.

A local session pointer and the desktop catalog both participate in activation. If the
working pointer advances but the catalog update fails, stale-catalog writes are refused;
reopening reattaches the verified working copy. Pending in-memory content is not discarded.

## Backups, assets and compatibility

The existing backup implementation now has a retained variant used only for portable
libraries: it preserves periodic verified snapshots/objects without automatic rotation.
Legacy backup rotation is unchanged. Previously created backups in the same main-app
store remain selectable after conversion. Preview's original store remains intact.

Image import/read/open, cold-archive creation/restoration, recovery export and local
SQLite writes reuse their existing host commands with the portable copy's asset path.
The active data schema, item IDs, revisions, document model and editor serialization
are unchanged. Catalog entries gain a backward-defaulted portable-mode flag.

Automatic master publication uses the existing native worker/serialization boundary.
No provider APIs, cloud polling, background publication timer or cloud lock is introduced.

## Verification and limits

All filesystem tests use disposable synthetic stores. Native tests use real SQLite/files;
browser tests simulate native replies and separately verify interface behavior.

- Publication tests inject failures after candidate creation, pending receipt, before
  replacement, after replacement and after recording success.
- Tests cover conflict at the last check, candidate corruption, missing/read-only master,
  changes during packaging, Save As, no-op Save and post-publication local edits.
- Host tests cover source preservation, closed-Preview conversion, local-only saving,
  verified publication, conflicts, restart and stale-catalog write protection.
- Backup testing verifies more than ten portable snapshots are retained.
- `tests/portable-desktop.cjs` covers startup, autosave, manual saving/caret/undo,
  cancellation, close Retry/Save As/Cancel, failed local writes and explicit recovery.
  It is included in the existing core CI runner; no existing tests/gates were removed.

Actual Windows/macOS packaged UI testing, power-loss/kill testing, large-library
measurements and controlled cloud-folder acceptance remain Stage 4. POSIX directory
flushing is used where supported; Windows durability and filesystem replacement guarantees
still require native acceptance testing. Fingerprint checks plus replacement are not a
universal compare-and-swap against a noncooperating sync client. The sequential-use and
completed-cloud-sync assumptions remain essential.

Recovery candidates and retained backups can grow in size. A retention policy needs
separate approval; this implementation does not delete them automatically.

## Rollback and next approval

Legacy code and originals remain retained. Do not continue editing the old source after
conversion: it will not receive future portable edits. After new edits, use a current
verified recovery export/snapshot rather than treating the original source as current.

Stop for Stage 4 approval before packaging/testing installed apps or using a controlled
cloud folder. Commit, push, release and installed-app replacement remain separately gated.

## Actual local verification — 15 November 2026

- Shared library: **47 passed** (including all Stage 2 tests and publication fault tests).
- Desktop-native, `inline-images-preview`: **20 passed**, one pre-existing optional
  storage-growth diagnostic ignored.
- Complete core runner: **59 passed, 0 failed**. Chromium used installed Helium; WebKit
  used the Playwright runtime. These are browser simulations, not packaged WebViews.
- Build safety gates: passed, including 4,096 prerequisite outcome combinations.
- Whitespace/diff check: passed.

The first browser attempt could not launch the uninstalled bundled Chromium executable.
The installed Chromium-based Helium executable was then used. A new test initially changed
model text directly while an open editor still held older text; it was corrected to use
actual keyboard input. The complete suite above passed afterwards; valid assertions were
retained. No unrelated regression assertions were removed or weakened.

Stage 2's iOS simulator check remains blocked by the missing Apple simulator SDK.
No claim is made of Windows filesystem validation, native packaged UI acceptance, actual
cloud synchronization, or physical power-loss testing in this stage.
