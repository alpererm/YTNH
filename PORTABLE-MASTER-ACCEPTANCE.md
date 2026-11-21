# Portable master: PM-02, cleanup and acceptance status

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

15 November 2026. This supersedes PM-02's open status and the menu inventory in
PORTABLE-MASTER-STAGES5-7.md. **Not release-approved.** No commit/push/release performed.
Windows execution was deliberately not attempted following the user's instruction.

## Changes completed

- PM-02: `WorkingStore::recovery_report` returns verified copies plus per-entry diagnostics.
  The recovery dialog displays both, including a warning-only state if every copy is invalid.
  Explicit selection validates that exact generation. Unrelated damaged receipts no longer
  block verified explicit recovery. Invalid files remain untouched.
- `recovery_copies` remains strict for automatic activation. Unreadable records may hide
  unpublished work; they must not be silently ignored. Existing dirty-current-copy guards,
  revision identity/base validation and catalog activation remain enforced.
- JSON import removed: no Restore recovery export menu, pickRecovery frontend API, native
  import operation or JSON-grant handoff lookup. Store import and original-source fixture
  helpers compile only under tests. `lifecycle::migrate` moved out of production library
  source into `crates/library/test-support/json_migration.rs`, included only by synthetic
  tests and the CI fixture example. JSON export and its file-writing safeguards remain.
- Removed Connect handoff folder, Receive handoff and Convert existing SQLite library
  menus, associated UI helpers, native folder grants/tickets, manual receive/latest/folder
  lookup endpoints and standalone SQLite selection/conversion endpoint. Old conversion
  and manual-receive fixture helpers are test-only.
- Recover local portable library remains. Restore SQLite backup, cold-archive restoration,
  emergency export and currently open legacy-library conversion remain intact.

No database/schema/content changes, automatic repairs, archive deletions, retention policy
changes, weakened CSP or new dependencies were introduced.

## Verification

- Shared library: **50 passed**, 0 failed. Includes PM-02 valid/invalid receipts, explicit
  recovery, automatic-activation refusal and preservation of damaged evidence.
- Complete backup: a synthetic model with managed image and cold archive is snapshotted;
  a portable master rebuilt using only backup SQLite and backup objects verifies with
  identical model/identities. Image bytes match. Corrupting the backup asset rejects the
  next reconstruction; the original and previously rebuilt masters still verify.
- Desktop-native image-enabled suite: **20 passed**, one existing diagnostic ignored.
- Complete browser/model suite: **59 passed**, 0 failed after PM-02 and JSON import removal.
- After the final three menu removals: **8 focused browser runs passed** across Chromium
  and WebKit; desktop-native suite rerun passed; production compile passed without warnings.
- Workflow safety tests and whitespace checks passed. Earlier initial fixture compilation
  errors were corrected by updating the CI example's test-support import/doc-comment order;
  no regression assertions were removed to obtain a pass.

Evidence logs: `/tmp/ytnh-pm02-library.log`, `/tmp/ytnh-menu-native.log`,
`/tmp/ytnh-pm02-core.log`, `/tmp/ytnh-menu-final.log`, `/tmp/ytnh-menu-check.log`.
These are real native SQLite/filesystem tests plus browser simulations, not Windows tests.

## Remaining handoff-removal design

The approved direction is conversion-only compatibility followed by removal of the old
runtime. The explicitly requested unused paths above are removed. Remaining components
still have production callers and are not safe dead-code deletions:

1. Existing catalog entries: introduce a clear, cancellable transition for already registered
   legacy libraries. Verify current local revision/assets, preserve paused/dirty states and
   originals, and never assume an old local copy is the latest cross-device state.
2. Only after that transition is verified, remove legacy openAutomatic/verifyAutomatic,
   idle snapshot scheduling/settings, prepare/resume UI and native auto_snapshot/inspect/
   auto_receive/gate/reverify endpoints. Keep exact conflict guards until replacements exist.
3. Retain shared archive validators, immutable-object writes, revision ancestry, exports,
   backups and asset protection. Their presence in transfer.rs does not make them obsolete.
4. Replace legacy-only CI scenarios with equal-or-stronger portable interchange tests before
   retiring them; do not remove packaging prerequisites or ignore failures.
5. Retain every existing library, source, backup, receipt and handoff file. Code retirement
   does not authorize deleting user recovery data.

No further individual approval is being requested for this design under the user's prior
instruction. Implementation beyond the completed dead paths is still constrained by
replacement verification and the unresolved acceptance gates, not by a permission pause.

## Packaged acceptance and release gate

An isolated macOS acceptance app was built, ad-hoc signature verified and launched under
its own identifier. macOS reports interface automation disabled. This permits a build/
launch smoke check but not a claim that native pickers, edit/close/recovery dialogs or CSP
interactions all passed. The final post-menu bundle is built separately as Portable Review.
Neither bundle replaces the installed app or shares its library directory.

Windows remains UNVERIFIED; no time was spent executing Windows tests. Full native Mac
interaction checks and actual cross-computer/cloud transfer are also outstanding.
The user explicitly required release only after acceptance passes; omitting Windows
execution does not itself make acceptance pass or waive the release condition.

Accordingly: no version bump, release tag, push, installer publication, automatic update
or installed-app replacement. Local validation bundles are not a release.
