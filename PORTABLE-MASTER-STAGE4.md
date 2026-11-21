# Portable master — Stage 4 verification checkpoint

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

Date: 15 November 2026. Status: **partially verified; not release acceptance**.
No application implementation, persistent format, production configuration or user library
was changed in this stage. No commit, push, installer replacement or release was performed.

## macOS package

Built the current source with the normal image-enabled release configuration, overriding
only product name, application identifier and window title using a temporary config:

- Product: YuTaNoHe Portable Validation
- Identifier: `com.localnotestodos.portable-validation`
- Bundle: `src-tauri/target/release/bundle/macos/YuTaNoHe Portable Validation.app`
- Local storage: `~/Library/Application Support/com.localnotestodos.portable-validation/`
- Temporary override: `/tmp/ytnh-portable-validation.conf.json`

Release compilation and app bundling passed. `codesign --verify --deep --strict` passed.
The bundle is ad-hoc signed, not notarized. The existing version remains 11.3.7; no release
version was assigned. Launch succeeded and the separate storage directory was created.
A screenshot showed the validation window rendering behind another window; this is a
limited startup observation, not comprehensive UI acceptance. The existing installed app
remained running and was not replaced or used for test data.

macOS reports interface automation disabled. Native picker, keyboard, close/cancel and
editor workflows were therefore not automated in the packaged WebView. Stage 3 browser
simulations and native storage tests must not be described as packaged UI tests.

## Controlled OneDrive-directory test

A temporary Rust driver called the actual `yutanohe-library` APIs. All source data came
from the repository's synthetic fixtures (including a managed image and cold archive).
All SQLite source/working databases and verification staging stayed under `/tmp`.
Only synthetic portable masters were written beneath this NEW directory:

`<OneDrive folder>/YuTaNoHe-SYNTHETIC-VALIDATION-6cd98830-f140-4109-be30-a3dfa5bb635f`

Local evidence and two independent simulated-device stores:

`/tmp/ytnh-stage4-6cd98830-f140-4109-be30-a3dfa5bb635f`

Driver/source: `/tmp/ytnh-stage4-probe/`
Output: `/tmp/ytnh-stage4-cloud.log`

Passed:

1. Create/load Unicode-path master; compare full loaded model; verify required assets;
   confirm working SQLite is outside the cloud directory.
2. Local edit leaves master bytes unchanged; publication produces the exact expected
   verified revision.
3. Two independent local stores exchange sequential changes through the master; a clean
   older store adopts the next verified revision.
4. A dirty store rejects publication and reopening after an external revision; master and
   local conflicting edits stay intact. Save As preserves both branches.
5. A missing master rejects publication without recreating it or discarding local edits;
   restoring it allows retry.
6. A deliberately truncated separate package is rejected; valid master stays intact.
7. Drop/reopen the local store and recover the verified published state.

The first driver compilation failed because its temporary main function's error type
omitted Send + Sync. The driver was corrected and all seven cases passed. Application
code was not changed to obtain these results.

All synthetic evidence is retained. `Incomplete.ytnh` is deliberately invalid. Do not use
these fixtures as a real library. The two stores ran on ONE Mac, accessing the locally
visible OneDrive folder. This does not prove upload completion, download hydration,
Windows behavior, or cross-computer cloud synchronization.

## Outstanding acceptance checks

- Windows packaged app, actual native dialogs, replacement permissions/locks and close
  recovery. No accessible Windows runtime or VM was found here; no remote job was started.
- Full macOS native create/open/edit/autosave/Save/close/reopen, cancelled pickers,
  conflict Retry/Save As/Cancel Close, image/archive restoration and UI state preservation.
- Actual sequential Mac-to-Windows and Windows-to-Mac transfer after independently
  confirming cloud synchronization; offline/cloud-only and conflicting-copy cases.
- Process interruption during publication and realistic large-library timing/storage
  measurements. Earlier fault-injection results do not establish physical power-loss safety.
- Native CSP verification beyond successful startup; browser CSP regressions remain the
  previous Stage 3 evidence and are not a substitute for native acceptance.

No newly verified application defect was found in the executed checks. That does not
resolve the untested cases. Do not retire legacy code or designate this release-ready
based on this checkpoint. Stage 5 and any push/release still require separate approval.
