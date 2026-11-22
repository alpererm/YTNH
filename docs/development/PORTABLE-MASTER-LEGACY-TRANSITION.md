# Registered-library transition and handoff runtime retirement

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

15 November 2026. Implemented after the user's approval to continue the remaining design.
This supersedes the live-legacy-runtime status in the earlier acceptance/audit reports.
No commit, push, release, installed-app replacement or Windows execution was performed.

## New path

A registered legacy library is no longer opened for editing through the handoff runtime.
Startup/recent-file loading instead:

1. Verifies a complete disposable package from the local SQLite copy and its managed files.
2. Shows an explicit local-copy conversion choice. It warns about paused state and
   unpublished work, and clearly says no remote handoff or other computer was checked.
3. Offers conversion, local recovery export or cancellation. Missing assets and errors offer
   retry/export/cancel; they do not activate a partial library.
4. Requires a NEW `.ytnh` filename. A cancelled native picker does not activate anything.
5. Checks the reviewed revision again, builds/verifies the complete master and activates the
   portable local copy only on success. Original source, archives, catalog-entry recovery
   metadata and backups remain retained. Library UUID and content are preserved.

`legacy_review` grants no editing permission. `portable_transition` requires that exact
reviewed revision; ordinary portable write access is granted only after successful
activation. Read-only review does not resume a paused library or select a newer snapshot.

The user must choose the intended local copy: the prompt does not claim it is the latest
copy on another computer. A stale/paused source can be exported/cancelled instead.

## Removed production paths

- Frontend automatic handoff inspection/receive dialogs and snapshot publication timer.
- Handoff idle setting and its preference reads/writes.
- Prepare handoff, Open paused library and redundant Convert this library menu controls.
- Native gate, prepare, auto_snapshot, inspect/preview/auto_receive, resume, allow_local,
  check_local and reverify_current dispatch paths.
- Methods used solely to construct/exercise historical handoff fixtures now compile only
  with `cfg(test)`. They are not a hidden runtime mode or an application API.
- Earlier removed Connect/Receive/standalone SQLite conversion and JSON-import paths remain
  removed. Explicit registered-library transition does not reintroduce a general file importer.

Shared archive validators, object checks, revision ancestry, SQLite transactions, portable
publication, backups, recovery and source catalog metadata remain. Historical transfer
format readers and native fixture tests are not deleted merely because they use the word
handoff. No old user data or recovery history is pruned.

## CI replacement

`crates/library/examples/platform_portable.rs` replaces `platform_handoff.rs`.
The existing macOS → Windows → macOS job graph now exchanges a portable master rather than
handoff codes and external exchange files. It checks model equality, schema/location data,
managed image/dimensions, cold archive restoration, UUID identity and stale-master refusal.

Historical job IDs and installer dependencies are unchanged. The workflow contract now
requires the exact portable example invocation in each of the three jobs. No jobs were
triggered; no Windows testing was performed. The three stages ran locally on macOS with
synthetic files at `/tmp/ytnh-portable-ci-transition`.

## Verification

- Shared library: **50 passed**.
- Desktop-native with packaged image feature: **21 passed**, one existing diagnostic ignored.
- Full Chromium/WebKit/model suite: **59 passed**, no failures.
- Production compile: passed without warnings after obsolete helper isolation.
- Portable send/reply/verify: passed locally on macOS. Not a cross-OS result.
- Workflow dependency/gate checks and whitespace checks: passed.

Native transition regression covers paused source, stale revision, damaged required archive,
unchanged source SQLite, original-source retention and identical library UUID after conversion.
Browser transition/cancellation regressions replace the former UI handoff contract; native
historical safety tests remain, and portable autosave/recovery regressions were not removed.

Logs: `/tmp/ytnh-transition-native.log`, `/tmp/ytnh-transition-library.log`,
`/tmp/ytnh-transition-core.log`, `/tmp/ytnh-transition-check.log`,
`/tmp/ytnh-transition-interchange.log`, `/tmp/ytnh-transition-gates.log`.

The full browser run covered the functional changes. Subsequent changes were tooltip text,
test-only helper annotations, the CI example and its workflow contract. Production compile
and the corresponding native/example checks passed. No packaged interaction result is
inferred from these source/browser tests.

## Remaining acceptance limits

The earlier local macOS review app predates this transition. This turn did not replace or
rebuild it. Full native interaction acceptance remains outstanding; macOS interface
automation was unavailable in the previous check. Windows execution remains explicitly
unverified and is not being attempted at the user's request.

Release remains blocked by the existing acceptance requirement. There is no version bump,
tag, push, updater publication or automatic release.
