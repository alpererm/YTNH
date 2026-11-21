# Post-cleanup audit revalidation and corrections

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

14 November 2026. Baseline: v11.3.6, commit `5172353`. Release: v11.3.7.

## Cleanup verification

The initial investigation was read-only, with source fingerprints checked before and after. It covered the CLEAN-001–006 changes: source ownership, removed browser/JSON save paths, SQLite-only open/recent/startup routing, explicit recovery import, and retained emergency export/archive recovery.

The complete available browser/model suite initially ran 133 checks: 119 passed and 14 failed across eight historical test files. Every failure reproduced against the saved pre-cleanup sources. These failures did not establish a cleanup regression.

The eight files were reconciled with the current interface: stacked sidebar properties, marker-based interactions, 8px indentation, the writing frame, explicit formatting-menu opening, pane-focus indicators and weekend-independent fixtures. Existing interaction assertions were retained. Two previously Chromium-only palette tests now also run in WebKit. This exposed a real WebKit shortcut failure: native Command+B/I did not apply formatting. The editor now explicitly routes Ctrl/Command+B/I/U through its existing formatting commands, preserving serialization and undo.

## Current audit status

| Finding | Status and evidence |
| --- | --- |
| AUD-001 | **Resolved for the identified case.** `library-bridge.js` revalidates the original handle after cancelled reopening; `src-tauri/src/libraries.rs` implements `reverify_current`. Dirty in-memory edits are retained. `tests/cancelled-reopen.cjs` and native tests cover stale revision, pause, exchange access and cancellation. |
| AUD-002 | **Resolved.** `planner-meetings.js` and `planner-model.js` reuse occurrence offsets for future-series moves without changing recurrence identity. `tests/meeting-moves.cjs` covers weekly, interval, month-end/custom recurrence and DST cases. |
| AUD-003 | **Resolved.** `planner-outlook.js` handles explicit series/detached cancellations and exclusions. Missing entries in partial exports are not treated as cancellations. `tests/outlook-cancellations.cjs` verifies source isolation, retained history and undo. |
| AUD-004 | **Resolved for the audited validation gaps.** `planner-model.js`, `crates/library/src/planner.rs` and repository tests validate schedule payloads and retain the committed revision after rejection. JS keeps responsibility for full Intl/ICAL interpretation; Rust does not introduce a second recurrence engine. |
| AUD-005 | **Corrected and regression-tested; packaged Windows reproduction remains outstanding.** `src-tauri/src/close_probe.rs` retains the deadline after acknowledgement. `bridge.js` clears it only after completion, cancellation or an error, not on duplicate close events. Repeated user close requests may offer a warning after 3 seconds without acknowledgement or 30 seconds during a pending operation. There is no automatic force-close. Native blocked-worker tests and browser bridge tests cover pending, repeated, cancelled, failed and successful attempts. |
| AUD-006 | **Resolved in workflow configuration.** `.github/workflows/build.yml` requires browser, native Windows/macOS and Mac→Windows→Mac handoff validation before packaging. `tests/workflow-gates.rb` verifies dependency edges and failure/skip outcomes. Hosted execution is separate from local verification. |
| AUD-007 | **Resolved.** Preview native validation enables `inline-images-preview`, matching `src-tauri/tauri.preview.conf.json`. Default configuration is tested separately. |
| AUD-008 | **Resolved for the known failures.** All available browser/model checks pass. `tests/core-regressions.cjs` now gates CI with 28 scripts in both engines plus the pure model test (57 checks). No valid tests were disabled to obtain a pass. |
| AUD-009 | **Resolved for the identified CSP violations.** The reference description and recurrence interval use stylesheet rules in `app.html`. Permanent `tests/desktop-csp.cjs` checks those controls, hierarchy connectors and resized images under the desktop nonce policy. CSP was not weakened. |
| AUD-010 | **Measured; larger-library performance remains an improvement opportunity.** `tests/outline-benchmark.cjs` confirms costly expanded-tree rendering. A disposable per-render item/child-index experiment produced only modest gains; no unproven persistent cache or tree rewrite was introduced. See measurements below. |
| AUD-011 | **Confirmed storage-growth limitation; no deletion implemented.** `crates/library/src/transfer.rs` publishes immutable snapshots and `src-tauri/src/libraries.rs` retains activation copies. The opt-in native growth test confirms accumulation. A retention policy must account for offline devices, divergent ancestry, incomplete transfers, archive/image references and recovery before deletion is safe. |
| AUD-012 | **Resolved for current documentation.** `README.md`, `SQLITE-PREVIEW.md` and `tests/README.md` describe current source ownership, storage/recovery and validation. `AUDIT-CORRECTIONS.md` is explicitly marked historical and superseded by this report. |

## Verification results

- Complete browser/model suite: **135 passed, 0 failed**, across 69 test files. Chromium/Helium and WebKit were used where supported.
- The corrected eight historical files: **16 passed**, including the added WebKit palette coverage.
- Native default configuration: **15 passed**, one opt-in storage diagnostic ignored.
- Native preview configuration: **17 passed**, one opt-in storage diagnostic ignored.
- Shared library: **15 passed** (3 unit, 1 image-format, 11 repository tests).
- Native close state-machine fault injection: **3 passed**; browser tests verify bridge completion and cancellation handling.
- Workflow gate tests: **4,096 synthetic outcome combinations**, with **8 deliberately broken configurations rejected**.
- Separate opt-in storage-growth diagnostic: passed; no user library accessed.
- macOS v11.3.7 preview release executable: **compiled successfully** with the packaged image feature configuration; no installer was created or launched.
- Final whitespace/error check: **passed**. Version declarations match across the frontend, both Tauri configurations, Cargo manifest and lockfile.

Tests use synthetic databases and temporary stores. The editor, undo architecture, SQLite schema, UUIDs, hierarchy and JSON recovery format were not replaced.

## Performance evidence and remaining scope

The post-cleanup baseline covered 250, 1,000 and 2,000 logical items, seven render/layout measurements per case, five grouping/filter/linked-placement scenarios. Model and visible order remained unchanged in all 15 cases. At 2,000 items, hierarchy/scheduled/linked medians were approximately 1.17/1.43/1.14 seconds; some other checks were running concurrently, so these are not precise before/after comparisons.

A subsequent alternating comparison on the same 2,000-item fixtures tested an ephemeral lookup index without changing source files. Median milliseconds:

| Mode | Existing lookup | Experimental index |
| --- | ---: | ---: |
| Hierarchy | 1,090 | 1,029 |
| Scheduled grouping | 1,421 | 1,278 |
| Linked placements | 1,139 | 1,116 |

Visible rows, ordering, metadata and model were identical. The roughly 2–10% improvement does not explain most rendering cost. A more useful next performance investigation is profiling DOM/layout and metadata work before choosing another targeted correction.

Twenty alternating synthetic handoffs produced 21 manifests, approximately 4.20 MB in the exchange directory, and 11 local database copies per simulated device including the active copy. Rolling backups do not bound immutable snapshots or retired activation copies. No automatic cleanup was added: deleting a snapshot merely because it is old can remove an offline computer's required handoff or recovery path.

## Remaining coverage gaps and priorities

1. Verify the close fallback in an actual installed Windows app, including a stalled native save and a healthy slow save. Native state tests do not reproduce WebView IPC or the operating system's dialog handling.
2. Profile large Outline render/layout cost before further optimization (AUD-010).
3. Design and validate recovery-safe retention before implementing deletion (AUD-011).
4. Exercise recovery pickers, OneDrive placeholders/latency and cross-computer timing on real Windows/macOS installations. Browser native-call mocks do not replace this.
5. The local iOS cross-check could not complete because this Mac lacks the iPhone Simulator SDK. The Rust target is installed; this is an environment limitation, not a demonstrated project error. CI retains its iOS compatibility check.

The most important correction from this revalidation was the stalled-close watchdog; it is included with tests. The highest-priority remaining verification is its installed-Windows fault-injection test. No new cleanup-caused data corruption or security regression was demonstrated.

## Hosted CI portability follow-up

The first v11.3.7 hosted Ubuntu run completed 40 core checks and failed 17, so the release gate correctly skipped both installers. The earlier 135-check result was local macOS verification, not Linux certification. Seven historical tests used `/private/tmp` (14 failures across two engines); the editor-structure test used Mac-only paragraph shortcuts (two failures); the Chromium Source test assumed that the outer frame and usable scroll width differed by at most 3px (one failure).

The correction uses the OS temporary directory, browser-platform movement/undo shortcuts, and the actual scroll-container client width. The Source test models a 15px reserved strip and verifies that an intentionally narrowed editor still fails its assertion. Functional assertions and release gates remain enabled. No production editor or storage behavior changed in this correction.

Verification: 57/57 core checks passed locally; 18/18 focused checks passed using the Linux shortcut branch and a separate temporary artifact directory; 2/2 editor-structure checks passed using the Windows shortcut branch. These platform overrides exercise JavaScript branches, not native Linux/Windows installations. Workflow contract checks passed. The main configuration compiled successfully and its generated frontend enables image editing, matching the preview configuration as explicitly approved. Application identifiers were preserved. Hosted rerun results are not claimed here.
