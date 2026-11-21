# Audit correction record

> Historical pre-cleanup record. Current outcomes and verification are recorded in
> [POST-CLEANUP-REVALIDATION.md](POST-CLEANUP-REVALIDATION.md).

14 November 2026 · baseline v11.3.6 / commit 5172353 · branch audit-fixes

Changes are uncommitted and unpushed. No installer was created for this audit.
Tests used synthetic libraries, not the working user database. SQLite schema,
item identities and the existing editor/undo architecture were preserved.

## Finding outcomes

| Finding | Outcome |
| --- | --- |
| AUD-001 | Cancelled reopening revalidates the original library handle against its existing revision. Newer handoffs, missing exchange access and paused libraries remain blocked. Pending edits are not reloaded. |
| AUD-002 | Local future-series moves reuse the existing occurrence-offset representation. The recurrence's original occurrence identity remains stable while the displayed date moves. Existing exceptions and history are retained. Single-occurrence edits remain independent. |
| AUD-003 | Explicit STATUS:CANCELLED, METHOD:CANCEL, detached cancellation exceptions and EXDATE exclusions reach the preview/merge. Matching future coverage is disabled using the existing enabled flag. Partial-export absence is not cancellation. Past coverage, documents and local exception metadata remain stored. |
| AUD-004 | Planner load/save boundaries reject malformed dates, time ranges, recurrence/version data and exception shapes. Native validation occurs before writes and after reads. Failed writes preserve the committed model and revision. Valid zero-duration imported meetings remain supported. |
| AUD-005 | Investigation only. Native state-machine fault injection confirms that acknowledgement clears the watchdog even while a worker remains blocked. A real Windows WebView/IPC stalled-close reproduction is still outstanding. Production close behavior is unchanged. |
| AUD-006 | Packaging requires browser checks, both native-validation platforms and the completed cross-platform handoff chain. No installer upload before those stages succeed. Packaging commands and artifact settings remain intact. |
| AUD-007 | Preview native tests enable inline-images-preview, matching the packaged configuration. Main/default tests retain their default configuration. The workflow contract checks the preview feature list. |
| AUD-008 | Four obsolete assertions reconciled against approved behavior. Shared core runner, portable screenshots and a current-source SQLite frontend fixture replace stale test assumptions. |
| AUD-009 | Reference descriptions and recurrence interval width use stylesheet rules instead of nonce-blocked HTML style attributes. CSP unchanged. |
| AUD-010 | Benchmark completed; no optimization implemented under the investigation-first scope. Repeated rendering is costly for large expanded hierarchies. Measurements below provide a baseline for a targeted lookup-index change rather than a rewrite. |
| AUD-011 | Synthetic storage-growth measurement completed. No retention, deletion or garbage-collection behavior was added. Measurements below. |
| AUD-012 | Current source ownership, modules, desktop-only distribution and +2 Editor / +3 Calendar shortcuts documented. Older release notes are explicitly historical. The old import helper remains available but is documented as a deliberate overwrite/recovery tool, not the authoring workflow. |

## Verification

- Core browser/model runner: **39 passed, 0 failed** (19 suites each in local
  Chromium/Helium and WebKit, plus the pure Planner model test).
- SQLite repository integration suite: **11 passed**.
- Native default configuration: **12 passed**.
- Native preview configuration: **14 passed**, including image-feature tests.
- The opt-in storage diagnostic passed separately; it is intentionally ignored
  during normal native tests.
- Workflow contract: **4,096** synthetic outcome combinations and **8** deliberately
  broken configurations rejected. This is not a GitHub Actions execution.
- Four deliberate browser regressions in disposable copies were rejected during
  AUD-008 verification.
- Close diagnostic: **3 native characterization tests passed**.
- Existing CSP regression remains in the permanent CI suite and now also checks
  the two targeted styles in light/dark and narrow/wide layouts.
- No dependencies were added. No production security policy was weakened.

The new scheduling tests reproduce the old failures and cover weekly, multi-week,
month-end, custom-rule and DST moves; cancellation/source isolation, partial
exports, undo, retained documents/history; and malformed Planner payload rejection.
Native tests exercise transaction rollback and reopening with occurrence overrides.

### Verification limits

These runs were on macOS. Browser IPC simulations are not packaged-desktop tests.
Hosted Windows/macOS workflows, real OneDrive transfer latency and a native Windows
stalled-close scenario were not executed. The branch has not been pushed.

JavaScript uses the existing Intl and ICAL implementations for complete timezone
and custom-rule interpretation. Rust independently validates structural and
numeric constraints without introducing a second IANA/RFC engine or new dependency.
It does not certify arbitrary IANA names or RFC rules without the shared frontend
validation.

## AUD-010 measurements

Synthetic mixed Notes/Todos with nested hierarchy, metadata, pinned entries,
scheduled/status groups, inactive filtering and linked placements. Seven timed
render-and-layout runs per case, WebKit on this Mac. Rendering preserved the model
and visible order in all 15 cases. This is not a benchmark of the user's database.

| Logical items | Hierarchy median | Scheduled grouping median | Linked placements median |
| --- | ---: | ---: | ---: |
| 250 | 63 ms | 70 ms | 106 ms |
| 1,000 | 379 ms | 474 ms | 471 ms |
| 2,000 | 1,081 ms | 1,468 ms | 1,137 ms |

The expanded DOM, layout, metadata and repeated lookups are all included.
These figures are not directly comparable with the audit's simpler flat fixtures.
A future optimization should first compare identical DOM/order/filter outcomes
using per-render lookup indexes; there is no evidence here to justify changing
the editor, hierarchy model or introducing virtualization.

Reproduce with tests/outline-benchmark.cjs. No timing pass threshold is imposed.

## AUD-011 measurements

Twenty alternating synthetic handoffs, one small library with a roughly 10 KB
edited body and the existing archive fixture. Both simulated devices use the real
native Store and snapshot activation. Each retained-copy count includes its active
copy. Byte totals include the store's other files and backups.

| Completed switches | Manifests | Shared exchange bytes | Device A bytes | Device B bytes | Local copies A / B |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | 379,923 | 572,625 | 380,624 | 2 / 1 |
| 5 | 6 | 1,153,987 | 1,344,783 | 1,152,782 | 4 / 3 |
| 10 | 11 | 2,129,761 | 2,125,133 | 2,319,211 | 6 / 6 |
| 20 | 21 | 4,204,195 | 4,194,792 | 4,204,550 | 11 / 11 |

The result confirms unbounded immutable-snapshot/retired-copy accumulation; ten
rolling backups do not bound these stores. It does not establish the user's actual
disk usage or a safe deletion policy. Any retention design must protect incomplete
transfers, divergent revisions, object references and recovery copies first.

## AUD-005 remaining work

The isolated probe compiles the actual acknowledgement body and timeout predicate,
then blocks a native worker. Repeated acknowledgements leave no watchdog deadline;
an unacknowledged timeout is still detected. This establishes the state-machine
gap, not the cause of the previously reported black window.

Before changing production close behavior, reproduce the stalled request through
the real Windows bridge. A correction should distinguish request receipt from
operation progress, preserve healthy slow writes, and require explicit user
confirmation before abandoning unsaved work. No force-close policy was added here.
