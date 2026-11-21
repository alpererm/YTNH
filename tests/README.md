# Core regression checks

Run from the repository root using the existing Playwright installation:

```sh
node tests/core-regressions.cjs
```

If Playwright is installed outside this repository, set `PLAYWRIGHT_MODULE` to its
module directory. The runner uses the same Node executable that launched it.
The existing CI browser job installs its pinned Playwright version and runs this
same entry point.

The default set runs one pure Planner model check and 31 scripts in both Chromium
and WebKit (63 checks). Each script has a two-minute timeout. Failures are reported
individually; any failure makes the runner exit unsuccessfully. Tests are not retried
or silently skipped.

For focused diagnosis:

```sh
BROWSER_ENGINE=webkit node tests/core-regressions.cjs keyboard-search milestones
```

`BROWSER_PATH` optionally selects a Chromium executable. The runner removes that
override for WebKit.

## Coverage

| Area | Scripts |
| --- | --- |
| Desktop CSP, hierarchy connectors, persisted image dimensions | desktop-csp |
| Shared markers and completion behavior | item-markers |
| Date navigation and Outline/Planner indicators | jump-to-date, outline-navigation |
| Search, caret return, shortcuts, capture focus, responsive toolbars | keyboard-search, desktop-shortcuts, capture-focus, workspace-navigation |
| Milestone hierarchy, archive restoration, recurrence and Calendar interactions | milestones |
| Autosave, conflicts, cancelled reopening and SQLite frontend recovery | autosave, bridge, cancelled-reopen, sqlite-desktop, portable-desktop |
| List structure, indentation, paragraph movement and editing | editor-structure |
| Image editing, serialization and undo | image-editing |
| Planner dates, completion, undo and view switching | daily-planner |
| Outlook import identity and recurrence exceptions | planner-outlook |
| Planner scheduling and recurrence model | planner-model |
| Future-series date moves and stable occurrence identities | meeting-moves |
| Explicit Outlook cancellations versus partial exports | outlook-cancellations |
| Invalid schedule rejection and legacy compatibility | planner-validation |
| Editor/Outline layout, themes, palette commands and Source bounds | editor-toprow, format-palette, interface, outline-layout, palette-layout, source-menu, workspace-density, writing-border |

The four reconciled legacy tests retain their interaction checks. Numeric-code
markup assertions now target shared markers; capture asserts Outline title
selection; Calendar activation asserts search dismissal; toolbar geometry tests
distinguish wrapped titles from fixed controls. Very long titles retain the
existing scrollable height cap. Screenshot paths use the operating system's
temporary directory.

## Limits

These are browser/model regressions, not installed Windows or macOS app tests.
The CSP test simulates the native style nonce policy. The SQLite frontend and
cancelled-reopen tests simulate native replies; real SQLite, archive, portable-master and
filesystem behavior remains covered separately by Rust tests.

The SQLite frontend fixture assembles the current source and desktop bridges in
memory. It does not consume `web/index.html`, package an application, or certify
the native bundling process.

This is a targeted core set, not every historical test. Passing it does not resolve
all possible application defects. Native feature tests now match the preview
packaging configuration; actual hosted Windows/macOS execution still requires CI.


## Installer safety gates

Run `ruby tests/workflow-gates.rb` to check the workflow contract using Ruby's
bundled YAML parser. The CI browser job runs this before installing browser tools.
No additional Ruby gems are required.

Both packaging jobs require successful browser regressions, the full Windows/macOS
native-validation matrix, and the Mac → Windows → Mac portable-file round trip.
Native validation retains the SQLite tests and Mac-only iOS compatibility check;
both main and preview builds enable and test the packaged inline-images-preview native feature. Failed, cancelled or skipped prerequisites prevent
packaging; successful runs retain the existing Windows NSIS and macOS DMG artifacts.

The test checks dependency edges, unchanged packaging/artifact settings, 4,096
synthetic outcome combinations, and eight deliberately broken configurations.
These are static and simulated checks, not execution of the GitHub Actions runner.
Actual hosted behavior requires a separately authorized push/run. No installer
publication or native-feature configuration is changed by running this test.


## Additional diagnostics

- `node tests/outline-benchmark.cjs`: seven render/layout measurements per synthetic
  library/scenario, with stable model and visible-order assertions. No optimization
  or timing threshold is applied.
- `python3 tests/close-watchdog-probe.py`: runs the production close-state machine with a blocked-worker test using the
  existing local Rust toolchain. A repeated close request can offer an explicit
  force-close after 3 seconds without acknowledgement or 30 seconds while saving;
  it does not reproduce a Windows WebView/IPC hang or alter close behavior.
- Retired handoff growth/receipt scenarios were replaced by current portable-file checks.
  `crates/library/tests/portable.rs` covers retained generations, interrupted publication,
  damaged receipts, complete backups and required image/archive objects. No automatic
  retention policy or deletion was introduced.


Planner validation checks full timezone and custom-rule interpretation in the
shared JavaScript model using Intl/ICAL. Rust independently checks record shapes,
civil dates, finite time ranges, recurrence fields and version ordering before
writes and after reads; it does not duplicate the IANA timezone or RFC recurrence
engine. Invalid payload failures preserve the last committed SQLite revision.

## CI portability

Screenshot artifacts use `os.tmpdir()`, including when `TMPDIR` points to an isolated output directory. Editor movement and undo tests select shortcuts from the browser platform. Set `TEST_PLATFORM=Linux` or `TEST_PLATFORM=Win32` for `editor-structure.cjs` to exercise its non-Mac keyboard path locally; this is platform-branch simulation, not a native Linux/Windows run.

The Source layout test compares the writing width against its scroll container's available client width, accounting for reserved scrollbar space. It also models a reserved strip and deliberately narrows the editor to prove the corrected assertion still rejects broken sizing. Main and preview retain their existing application identifiers; only their image-feature configuration is aligned.

## Portable master storage

`cargo test --locked --manifest-path crates/library/Cargo.toml` includes portable
container, working-copy and publication recovery tests using synthetic local files.
`portable-desktop.cjs` is part of the core runner and simulates native replies; it does
not certify an installed app or cloud synchronization. See `PORTABLE-MASTER-STAGE3.md`
for scope, fault-injection checkpoints and remaining native acceptance tests.

Portable recovery additions: partial recovery reports preserve valid choices and expose invalid receipts without weakening automatic activation. The complete-backup regression rebuilds a verified master from retained SQLite plus objects, then rejects a corrupted asset. JSON migration is now offline test support (`crates/library/test-support/json_migration.rs`), included by fixture tests and the CI example only; the application has no JSON import command.

Registered legacy transition: `sqlite-desktop.cjs` now tests explicit conversion (paused/unpublished warnings, missing assets, stale-review retry, export and cancellation). `cancelled-reopen.cjs` verifies cancellation preserves pending content/history/selection and existing portable write permission. Historical handoff behavior remains native test-only fixture coverage, not a production workflow. CI uses `platform_portable` for the send/reply/verify artifact chain; historical job IDs are unchanged so installer prerequisites remain intact.

## Post-migration coverage

`native-theme.cjs` and `settings.cjs` now honor `BROWSER_ENGINE` in both engines.
The core CI set remains distinct from the additional historical suites.
See POST-MIGRATION-AUDIT.md for the baseline, final results, retired-test mapping,
and packaged-desktop verification limits.
