# Post-migration audit and targeted cleanup

15 November 2026 · application 11.4.0 · baseline main `10050d9` plus the existing,
uncommitted portable-master implementation. Audit initially read-only. The user
subsequently authorized proceeding with corrections without individual approval
stops, followed by pushing the completed work. No real library was used in this
audit. The preceding user-requested JSON conversion was a separate operation.

## Architecture and scope

- `app.html` owns the existing in-memory document model, rendering, interaction,
  undo snapshots and serialized autosave queue. No editor or Outline rewrite.
- `library-bridge.js` flushes pending inputs and local saves before master Save,
  normal Close or library switching. Local SQLite saves are not cloud publication.
- `src-tauri/src/libraries.rs` owns native pickers, local catalog, file grants,
  application storage and serialized native operations.
- `crates/library` owns transactional SQLite, revision ancestry, archive/image
  verification, portable ZIP64 packages and durable local working generations.
- A `.ytnh` contains its exact SQLite snapshot, revision/checksum manifest and all
  referenced managed image/archive objects. SQLite editing stays local.
- Publication verifies a candidate, preserves recovery evidence, checks the old
  fingerprint again and replaces through a same-directory temporary file. It
  verifies the final file before recording success.
- GitHub Actions retains Windows/macOS native validation, portable interchange
  and installer artifact generation. There is no application updater.

The pre-cleanup working sources and diff were preserved locally in
`/private/tmp/ytnh-pre-postmigration-cleanup.tar.gz` and `.diff`. These are source
baselines, not user-data backups. The dedicated branch is
`cleanup/post-migration-final`. Historical stage reports are not current acceptance
certificates; this report supersedes their runtime inventories.

## Regression baseline and evidence

Before corrections:

| Check | Actual result | Nature |
|---|---|---|
| Shared Rust library | 50 passed | Native SQLite/filesystem; synthetic data |
| Desktop native, image features enabled | 21 passed, 1 optional historical diagnostic ignored | Native tests on this Mac |
| Core browser/model | 59 passed | Chromium/Helium and WebKit; simulated native bridge |
| Additional historical browser attempts | 78 passed, 2 failed to launch | Both failing scripts were Chromium-only despite a WebKit request |
| Production image-enabled check | Passed, no warnings | Compilation, not packaging |
| Workflow gates | 4,096 outcomes, 8 invalid workflows and 2 bootstrap regressions checked | Static/simulated |
| Close watchdog | 3 passed | Native blocked-worker/state test, not Windows WebView IPC |
| Portable send/edit/return fixture | All three steps passed on macOS | Same machine, not Windows or cloud transfer |
| Outline benchmark | 15 scenarios retained identical model/visible order | Synthetic WebKit render/layout |

The two failed launch attempts were `native-theme.cjs:1` and `settings.cjs:4`:
these explicitly launched Chromium and ignored BROWSER_ENGINE; the WebKit run
therefore looked for an unavailable bundled Chromium binary. Their Chromium runs
passed using Helium. They now honor the selected engine and are in the core CI set.

Recovery reproduction used a temporary program calling the real shared library:
create and verify a master, load a working generation, corrupt only its active
session pointer, and request recovery. Output before correction:

```
Corrupt active session; valid retained database: true
Explicit recovery inventory: 0 usable, 1 issues
Explicit adopt: expected value at line 1 column 1
Original portable file still verifies: true
```

Evidence logs are local temporary artifacts:
`/private/tmp/ytnh-postmigration-library.log`, `ytnh-postmigration-native.log`,
`ytnh-postmigration-core-final.log`, `ytnh-postmigration-additional.log`,
`ytnh-postmigration-recovery-probe.log`, `ytnh-postmigration-benchmark.log`.

## Findings

Classes: A = safe cleanup; B = conditional/investigation; C = correctness;
D = protected functionality. Risk refers to changing the area, not a claim that
an untested failure has occurred. Locations below identify current functions;
removed code locations are identified explicitly as baseline locations.

### CLEAN-001 — A damaged active-session record hides valid recovery data

- **Class/category/confidence:** C / Reliability / Confirmed by native reproduction.
- **Location:** `portable.rs` WorkingStore::recovery_report/recovery_copy,
  `portable/publication.rs` WorkingStore::adopt_recovery. Baseline recovery_copy
  unconditionally propagated `self.session(...)` errors before validating the copy.
- **Current purpose/dependencies:** inventory and activation of retained SQLite
  generations; used by the recovery dialog and automatic activation guards.
- **Evidence/cost:** an invalid session pointer hid an intact database; explicit
  adoption failed with the same parse error. Data was retained but inaccessible
  through the built-in route.
- **Recommendation/status:** Correct; implemented. Verify immutable generation
  receipts independently for explicit recovery, report the damaged active record,
  preserve its original bytes before replacing the pointer, and refuse competing
  unpublished generations. Automatic activation still rejects warnings.
- **Risk/benefit/impact:** Medium / recovery reliability / intentional correction.
- **Verification:** damaged pointer with unpublished edits, unchanged master,
  retained damaged bytes, competing-copy refusal, existing orphan/invalid-receipt
  regressions. No automatic choice or silent database replacement.
- **Rollback:** revert the targeted source/test diff; retain recovery-record evidence
  and databases. No SQLite/package-format change or destructive migration.

### CLEAN-002 — A damaged catalog disables the recovery service itself

- **Class/category/confidence:** C / Reliability / Confirmed control flow and native regression.
- **Location:** `src-tauri/src/libraries.rs` Store::open, check_catalog_action,
  adopt_portable and dispatch. Baseline Store::open parsed catalog.json before any
  command, including recovery listing, could execute.
- **Purpose/dependencies:** catalog supplies recent libraries/device identity;
  WorkingStore has independently verifiable portable generation receipts.
- **Evidence/cost:** invalid catalog JSON prevented every library_action. Valid
  working copies could not be selected through the recovery menu.
- **Recommendation/status:** Correct; implemented restricted recovery mode. Normal
  opening/editing/saving remain blocked. Explicit recovery preserves the damaged
  catalog, then records only the selected verified copy. Other portable copies
  remain discoverable. A warning explains that legacy entries in the preserved
  catalog may still require manual recovery.
- **Risk/benefit/impact:** Medium / restores access without guessing catalog contents /
  intentional correction. No silent reconstruction or automatic database adoption.
- **Verification:** malformed catalog, refused normal actions, failed selection,
  successful explicit selection, exact evidence/master preservation and restart.
- **Rollback:** source revert; keep catalog-recovery and all generations. Do not
  overwrite the only catalog evidence or delete legacy paths.

### CLEAN-003 — Retired exact-code handoff engine and obsolete test execution

- **Class/category/confidence:** A for unreachable engine; D for shared validators /
  Legacy / Confirmed caller tracing.
- **Location:** baseline `transfer.rs:256` onward (metadata/code/list/publish/receive),
  baseline libraries.rs test-only gate/prepare/receive/automatic_snapshot/receipt/
  inspection methods, tests/repository.rs, old platform_handoff example.
- **Purpose/dependencies:** the old protocol published immutable directory parcels,
  paused senders and received exact handoff codes. Its desktop endpoints and polling
  UI had already been removed. Remaining test scenarios kept that algorithm alive;
  the remaining legacy image-cleanup branch was unreachable from writable runtime
  libraries, which must first transition to portable mode.
- **Recommendation/status:** Remove protocol; implemented after replacing relevant
  assertions with portable-file tests. Fixture seeding now creates existing SQLite
  state directly; no JSON migration engine is retained in the application or fixtures.
- **Protected dependencies:** immutable object writes, safe filenames, archive semantic
  checks, inventory, revision metadata and descends_from stay in transfer.rs. The
  module name is not evidence of obsolescence.
- **Risk/benefit/impact:** Medium / removes duplicate storage workflow and misleading
  test coverage / no intended active behavior change.
- **Verification:** portable stale/divergent/dirty rejection, corruption/incomplete
  packages, archive/image completeness, pins/identities, restart, backups, cancelled
  reopening, native writer locks and CI Mac→Windows→Mac portable interchange.
- **Rollback:** restore removed source/tests from baseline; no old handoff files,
  original JSON, catalog metadata or backups were deleted.

### CLEAN-004 — Unused JSON-reading command remains exposed

- **Class/category/confidence:** A / Legacy / Confirmed.
- **Location:** baseline bridge.js NativeFileHandle::getFile and pick(false),
  main.rs read_json/pick_json open branch; files.rs ReadResult.
- **Purpose/evidence:** the only live picker caller was exportText, always using Save.
  Portable open/recent/startup use library_action. No active UI needed JSON reading.
- **Recommendation/status:** Remove unused read command/open branch; implemented.
  Keep JSON recovery export, restricted grants, atomic writes and overwrite checks.
- **Dependencies:** files::atomic_json_write also writes the library catalog and
  Outlook file grants; deleting files.rs wholesale would break active functionality.
- **Risk/benefit/impact:** Low / smaller command surface and bridge / none intended.
- **Verification:** native compilation; bridge emergency export/cancel/revision tests;
  native bad-JSON, unknown-grant and overwrite-race tests.
- **Rollback:** restore removed command/adapter; no data-format change.

### CLEAN-005 — Two historical tests do not exercise the requested engine

- **Class/category/confidence:** A / Reliability / Confirmed launch evidence.
- **Location:** tests/native-theme.cjs:1, tests/settings.cjs:4,
  tests/core-regressions.cjs browserTests.
- **Purpose/evidence:** verify saved theme/native mapping and settings, but hardcoded
  Chromium made WebKit coverage misleading and failed locally without bundled Chromium.
- **Recommendation/status:** Correct engine selection; implemented and added both to
  permanent core CI. All functional assertions remain.
- **Dependencies:** existing Playwright only; no new tools/dependencies.
- **Risk/benefit/impact:** Low / trustworthy two-engine coverage / test behavior only.
- **Verification:** both scripts in both engines, full core runner (63 checks).
- **Rollback:** revert test/runner edits; does not affect user data.

### CLEAN-006 — Distribution guidance and CI names describe retired behavior

- **Class/category/confidence:** A / Legacy / Confirmed.
- **Location:** public-release-repository/README.md, tests/README.md,
  .github/workflows/build.yml and tests/workflow-gates.rb.
- **Purpose/evidence:** public guidance still described JSON as the active database,
  HTML distribution, five themes and reversed Editor/Calendar pane shortcuts. CI
  job labels still called portable tests handoffs. Older audit reports describe old tests.
- **Recommendation/status:** Correct current guidance/names; implemented. Historical
  reports remain evidence and are superseded by this report, not silently rewritten.
- **Dependencies:** renamed CI job IDs and artifact links updated together; success-only
  prerequisites, Windows/macOS matrix and installer artifact paths retained.
- **Risk/benefit/impact:** Low / avoids incorrect recovery/distribution advice / no UI change.
- **Verification:** workflow contract, exact package commands, documentation review.
- **Rollback:** restore documentation/names together; never bypass failure gates.

### CLEAN-007 — Duplicate active-session parsing

- **Class/category/confidence:** A / Duplication / Confirmed equivalent invariant checks.
- **Location:** portable.rs WorkingStore::recover; publication.rs WorkingStore::session.
- **Purpose/evidence:** both parsed the same session file, checked format/library/hash
  and UUID. Divergence would affect recovery consistency. Actual database/object
  validation belongs only to recover and is intentionally different.
- **Recommendation/status:** Consolidate only identical parsing through the existing
  session helper; implemented. No new abstraction or file split.
- **Risk/benefit/impact:** Low / one validation definition / none intended.
- **Dependencies/verification:** all recovery/open/publication tests, missing and invalid
  sessions; retain database identity, base-commit and asset checks in recover.
- **Rollback:** restore the inline parsing block; format unchanged.

### CLEAN-008 — Retained storage has no size bound

- **Class/category/confidence:** B / Complexity / Confirmed retention behavior;
  current real-user disk impact unmeasured.
- **Location:** portable/publication.rs publish_with_checkpoint, portable.rs load,
  lifecycle.rs backup_retained; publications/copies/backups directories.
- **Purpose/evidence:** preserve candidates, prior masters, local generations and
  backup objects after failure. Every changed publication can retain another full
  master plus its predecessor. A test deliberately retains 12 backups.
- **Recommendation/status:** Retain safety mechanisms. A separate storage-budget and
  reachability investigation is needed before proposing deletion. No pruning added.
  Removed only the unreachable legacy rotating-SQLite-backup branch; portable
  retention behavior is unchanged. JSON export replacement backups remain separate.
- **Dependencies:** crash receipts, orphan work, image/archive objects and backup restore.
- **Risk/benefit/impact:** High if deleted incorrectly / possible disk-space benefit /
  potentially significant. Do not equate a duplicate filename or old timestamp with garbage.
- **Verification before change:** measured portable growth, interrupted publication,
  offline master, all retained references, restore from every retained valid backup.
- **Rollback:** retention changes would require protected copies; none implemented.

### CLEAN-009 — Expanded Outline rendering remains costly

- **Class/category/confidence:** B / Complexity / Confirmed synthetic measurements;
  exact bottleneck not established.
- **Location:** app.html itemById:1699, childrenOf:1701, renderTree:4410 and row rendering;
  tests/outline-benchmark.cjs.
- **Purpose/evidence:** repeated lookups and full DOM/layout contribute to rendering.
  Current WebKit medians at 2,000 logical items: hierarchy 1,156 ms, scheduled 1,531 ms,
  linked 1,221 ms; all 15 scenarios preserved order/model. This is not a user-data benchmark.
- **Recommendation/status:** Profile before optimization; no cache/tree rewrite. Earlier
  lookup-only experiments yielded modest gains, insufficient evidence for structural change.
- **Dependencies:** placements versus items, filters, grouping, pinned expansion, metadata.
- **Risk/benefit/impact:** Medium / potential responsiveness / none allowed without equivalence.
- **Verification:** compare identical visible rows/order, every filter/grouping, clones,
  keyboard movement and archived/inactive behavior; measure render and layout separately.
- **Rollback:** no optimization implemented.

### CLEAN-010 — Similar application logic is intentionally different

- **Class/category/confidence:** D / Duplication / Confirmed inspection and regressions.
- **Location:** app.html itemMarker/markerAction, renderTree/paintPins/paintHierarchy,
  parseTitleDate/openJumpToDate, recurrence/status helpers; planner-model.js sessions,
  upcoming and meeting wall-time logic; crates/library/src/planner.rs.
- **Purpose/evidence:** pins reuse the row renderer but have independent expansion/filter
  semantics. Linked placements are not logical items. Calendar occurrences are not work
  sessions. Rich and Source serialization search different representations. JS timezone/
  RFC validation and Rust shape validation protect different boundaries.
- **Recommendation/status:** Retain distinctions. Shared markers, parser and row rendering
  already exist. No proven safe whole-function consolidation was found here.
- **Dependencies:** existing UI, recurrence identity/completion, inline references, undo,
  CSP-safe rendering and native validation.
- **Risk/benefit/impact:** High for indiscriminate consolidation / avoids regressions /
  potentially significant. Similar names or repeated small expressions are insufficient.
- **Verification:** feature suites for pins, linked locations, recurrence, meeting moves,
  cancellations, tables, inline Todos, images, search, keyboard and layout.
- **Rollback:** no production interaction changes.

### CLEAN-011 — Dependencies, permissions and schema metadata to protect

- **Class/category/confidence:** D / Dependency / Confirmed local inventory.
- **Location:** Cargo manifests/locks; capabilities/main.json; main.rs plugin setup;
  image_import.rs/image_preview.rs; schema.sql; files.rs; build.rs.
- **Purpose/evidence:** no updater plugin, permissions, endpoints, updater manifest,
  startup check or installation timer found. reqwest is for bounded HTTPS image import;
  platform image dependencies decode previews. WebView2 bootstrapper is a runtime
  prerequisite, not application auto-update. dialog/opener/global-shortcut are active.
- **Recommendation/status:** Retain active dependencies/permissions and CSP. No dependency
  addition, update or removal was justified by updater retirement. Remote repository
  secrets/assets were not inspected or deleted; no vulnerability-feed audit is claimed.
- **Schema:** commits support ancestry; files support managed archives; placement_keys
  preserves IDs through undo. applied_imports currently has no active caller, but removing
  an existing table brings no demonstrated benefit and would change schema compatibility.
  Retain model-version adapters even though standalone JSON import is retired.
- **Risk/benefit/impact:** High for mistaken removal / compatibility and security / potentially
  significant. No change to package format, schema, IDs, signing or native title-bar mapping.
- **Verification:** image-feature native tests, CSP browser checks, native compilation,
  source caller trace and unchanged installer IDs/capabilities.
- **Rollback:** no dependency/schema/security changes.

### CLEAN-012 — Native acceptance and filesystem limits are not simulation results

- **Class/category/confidence:** B / Reliability / Confirmed coverage gaps; no claimed native defect.
- **Location:** main.rs close routing; portable/publication.rs final fingerprint/replace;
  portable.rs sync_dir; Windows/macOS packaging workflow and acceptance documents.
- **Purpose/evidence:** ordinary Close and ExitRequested route through flushing/publication.
  State tests do not certify Windows WebView, installation policy, native pickers or
  provider-placeholder behavior. Windows directory fsync differs from Unix. A
  noncooperating external writer can race the last fingerprint check and rename.
- **Recommendation/status:** Retain fail-closed checks and sequential-device guidance.
  No claim of cloud completion or cross-device compare-and-swap. No new synchronization
  protocol. Actual installation/upgrades/downgrades remain unverified in this pass.
- **Dependencies:** native event loop, OS/filesystem/provider, installer identity and local data.
- **Risk/benefit/impact:** High if safeguards removed / trustworthy acceptance / no change.
- **Verification:** separately run Windows/macOS installer/open/save/close/recovery tests
  using isolated data, healthy slow saves and stalled IPC. User requested no time spent on
  actual Windows execution; it is not marked passed. No local package was authorized here.
- **Rollback:** retain previous installer and full master/recovery backup; do not assume
  uninstall or downgrade is safe or that older releases can open the new portable master.

## Retired-test mapping

- Exact-code publish/receive, wrong code, pause/resume and polling retries: protocol
  mechanics retired; portable malformed/truncated package, checksum, missing object,
  stale/divergent history and interrupted-publication tests replace their active obligations.
- Desktop handoff generation/activation tests: replaced by portable native open/save/
  publish/restart/stale-pointer tests, shared WorkingStore tests and bridge close/cancel tests.
- Old optional handoff growth diagnostic: retired with its engine. Portable retention
  remains explicit and tested, with no claim of a new portable growth measurement.
- Image cleanup test now creates a portable master and exercises portable backup/history
  protection instead of depending on an unreachable legacy write mode.
- JSON fixture conversion and arbitrary preview-library import test helper: removed.
  Registered existing-SQLite transition still verifies revision/assets, preserves originals,
  protects paused-source semantics and rejects stale reviews. Missing archive validation
  and complete JSON recovery export assertions remain.
- Removed JSON read-command mock; emergency JSON export tests remain.

## Revalidation of original AUD findings

| Original | Current conclusion |
|---|---|
| AUD-001 | Original handoff reopen path retired; portable cancellation/model retention covered by cancelled-reopen and portable-desktop tests. |
| AUD-002 | Future-series occurrence identity correction retained; meeting-moves and Planner model tests pass. |
| AUD-003 | Explicit Outlook cancellations retained; cancellation/import suites cover source isolation and partial exports. |
| AUD-004 | Native/JS Planner validation retained; rejection preserves committed revision. |
| AUD-005 | Watchdog correction retained; 3 native tests pass; installed Windows fault injection remains unverified. |
| AUD-006 | Installer gates retained and statically verified; interchange labels now describe portable files. |
| AUD-007 | Main/preview both test image-enabled packaged feature configuration. |
| AUD-008 | Baseline re-run; two additional engine-selection issues corrected, permanent CI expanded. |
| AUD-009 | CSP unchanged; permanent nonce-based hierarchy/image/editor checks retained. |
| AUD-010 | Current benchmark confirms cost; no speculative optimization. |
| AUD-011 | Old handoff growth protocol retired, but portable retention still grows; no automatic deletion. |
| AUD-012 | Current guidance corrected; historical documents clearly superseded by this report. |

## Final verification

| Final check | Result |
|---|---|
| Expanded core browser/model suite | **63 passed, 0 failed** |
| Additional historical suites | 75 passed in the final broad run; one WebKit click timeout passed when rerun alone with unchanged assertions |
| Shared Rust library | **52 passed, 0 failed** |
| Image-enabled desktop-native tests | **16 passed, 0 failed** |
| Recovery evidence durability follow-up | Damaged-session/competing-copy and damaged-catalog tests passed after directory-flush adjustment |
| Production native check | Passed without warnings |
| Portable send/edit/return | All three steps passed on this Mac |
| Workflow contract | Passed: 4,096 outcomes, 8 invalid workflows, bootstrap guards |
| Whitespace/error check | Passed |

An earlier overlapping browser run had one Chromium launch timeout and one WebKit
click-stability timeout. The complete core set then passed alone; the affected
historical editor/calendar interaction also passed alone without source/test changes.
This is recorded as intermittent local test execution, not a proven application
regression or a claim that the broad run had no failure. No assertions were weakened.
The final additional-suite total covers 38 scripts in both engines; theme/settings
now belong to the 31-script core set.

Final logs: `/private/tmp/ytnh-cleanup-core-acceptance.log`,
`ytnh-cleanup-additional-final.log`, `ytnh-cleanup-editor-calendar-acceptance.log`,
`ytnh-cleanup-library-acceptance.log`, `ytnh-cleanup-native-acceptance.log`,
`ytnh-cleanup-evidence-test.log`, `ytnh-cleanup-check-acceptance.log`.

No installer was built or launched during this audit. No actual Windows installation,
manual-upgrade/downgrade, native picker, real OneDrive transfer or packaged UI acceptance
is claimed. Earlier isolated Mac build/launch evidence predates these corrections.
The authorized push leaves hosted Windows/macOS packaging behind the existing gates;
it does not assert those future jobs have passed.

Current source-reference index (line numbers at audit completion):

| Finding | Source references |
|---|---|
| CLEAN-001 | portable.rs:634, :661; portable/publication.rs:91 |
| CLEAN-002 | libraries.rs:56, :85, :122, :130 |
| CLEAN-003 | transfer.rs:1, :180, :204; removed baseline transfer.rs:256 onward; repository.rs portable_interchange_is_fail_closed |
| CLEAN-004 | bridge.js:44; main.rs:17; files.rs:23; removed baseline main.rs:56 |
| CLEAN-005 | tests/native-theme.cjs:1; tests/settings.cjs:1; tests/core-regressions.cjs:4 |
| CLEAN-006 | public-release-repository/README.md:35; .github/workflows/build.yml:1; tests/workflow-gates.rb:15 |
| CLEAN-007 | portable.rs:508; portable/publication.rs:16 |
| CLEAN-008 | portable/publication.rs:142; portable.rs:546 (baseline); lifecycle.rs:38 |
| CLEAN-009 | app.html:1699, :1701, :4410 |
| CLEAN-010 | app.html:1704, :4316, :4433, :6172; planner-model.js:126, :170; crates/library/src/planner.rs:1 |
| CLEAN-011 | src-tauri/Cargo.toml:10; capabilities/main.json:6; schema.sql:1; src-tauri/build.rs:1 |
| CLEAN-012 | src-tauri/src/main.rs request_window_close and RunEvent handling; portable/publication.rs final check/persist; portable.rs:113 |

## Ranked highest-value changes and remaining roadmap

1. CLEAN-001: restore explicit recovery when the active session pointer is damaged
   (high benefit, medium change risk; implemented).
2. CLEAN-002: keep recovery accessible when the catalog is damaged
   (high benefit, medium change risk; implemented).
3. CLEAN-003: retire the unused handoff engine after portable-equivalent coverage
   (high maintainability benefit, medium change risk; implemented).
4. CLEAN-004: remove the unused native JSON-reading surface without removing exports
   (moderate benefit, low risk; implemented).
5. CLEAN-005: make two-engine regression coverage real and permanent
   (moderate reliability benefit, low risk; implemented).

CLEAN-001 was the safest high-value first correction because it had a narrow,
reproducible failure and an exact preservation test; it was implemented first.
The user's later instruction waived further approval stops. Remaining work is
native acceptance, storage-growth/retention design and targeted performance profiling,
not unapproved automatic deletion or a wholesale architecture rewrite.
