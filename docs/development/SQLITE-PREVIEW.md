# SQLite desktop preview

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

Use a disposable SQLite library for acceptance tests. The desktop application no longer opens historical JSON databases for editing or offers the old migration/fallback mode. Existing SQLite libraries and their handoff folders remain unchanged.

1. On the first computer, use **New file** to create a local SQLite library and choose its handoff folder, or reopen an existing library from **Recent files**.
2. To recover an exported library, choose **Restore recovery export…** and select its JSON. Keep the exported archives and `assets` directory beside it. Restoration verifies the source, stages the required files and database, checks the reconstructed model, and only then activates SQLite. Missing or damaged files leave the current library open; fix the recovery package and retry. Existing source fingerprints and handoff identities still prevent duplicate or conflicting recovery lineages. Normal **Open file** connects a handoff folder rather than opening JSON for editing.
3. The desktop editor continues to work with its in-memory document, existing undo stack and serialized save queue. Local autosave uses the existing idle/deadline scheduling. Rust compares the expected revision, updates normalized records, records the commit and verifies the projected model in the same transaction. A failed commit rolls back and leaves unsaved edits available for retry or recovery export. A local save says nothing about OneDrive transport.
4. On the other computer, use **Connect handoff folder…** once to identify the same library. Existing configured libraries reuse their saved paths. Both computers should use 11.3.1 or later for automatic handoff.
5. Edit and close the sender normally. Closing flushes local edits, publishes the exact committed revision with its archives and managed images, and writes a clean-close receipt. Idle snapshots use the same SQLite backup and immutable manifests. The idle delay defaults to two minutes and is configurable in Settings. Continuous committed changes trigger a snapshot within ten minutes. Normal close reuses an already published revision. A failed background publication retries after five minutes. Reopening committed but unpublished work schedules a new snapshot after the library has been verified or you explicitly choose the local copy.
6. Open the receiver. When a newer, complete handoff from the other device is visible and descends from the local revision, the app verifies and activates it automatically. The previous library is retained and backed up. Test a return trip with a disposable edit before switching your production workflow.

**OneDrive visibility.** The app can verify files in the configured local folder. It cannot confirm the latest cloud revision or upload completion. If no advance is visible, choose **Check again** when switching computers. **Work from local copy** explicitly accepts the possibility of stale data. A periodic snapshot or older manual package needs confirmation. A missing required object, invalid manifest or divergent history stops automatic activation. On an offline close you can retry, keep working or explicitly close with the committed local copy only.

**Manual recovery.** Prepare handoff and Receive handoff remain available for exact-code verification. Manual preparation pauses the sender and manual recovery retains its existing handling of delayed image originals.

## Backups, conflicts and rollback

**Backup** exports a new recovery folder containing compatible JSON and all referenced cold archives. Preserve the entire folder. Saving/recovery can export the current in-memory model even if a local write fails. **Restore SQLite backup** selects from periodic verified local copies (up to ten per library); restoration creates a new revision and a pre-restore backup. The archive vault is independent of the active SQLite copy and retains files needed by older backups. The preview keeps prior working generations and handoff objects for recovery; automatic cloud garbage collection is deliberately deferred.

For rollback, preserve the current SQLite library and export a **fresh recovery folder** before changing applications. A recovery export must be opened only with a version that supports its model schema and assets. Choose one continuing copy; do not edit two diverged copies or overwrite the original. For divergent histories, export each local copy separately, preserve the handoff folders, and select one manually after inspection. Record merging is outside this release. Existing source backups, managed archives and image objects are not deleted by the desktop-only cleanup.

## Platform boundary and acceptance

The Rust crate in `crates/library` accepts paths and device identities from its host and contains no Tauri window or desktop-directory APIs. Items and placements have separate IDs. Placement identities survive deletion/undo. Commit ancestry, entity changes, tombstones, an import ledger and a typed external-file inventory provide extension points for offline mobile imports and future assets. The desktop supplies local directories, pickers, file grants, code entry and a single-writer lock. No mobile interface or mobile sync runs in this release.

The cross-OS CI fixture travels through GitHub artifact transport. That tests actual Windows/macOS SQLite interchange and archive bytes. OneDrive hydration, company policy and cloud completion require the real two-computer acceptance test above. Keep production on the stable release until it passes.


## Linked locations in preview 11.1

Select an Outline row and press **Ctrl+Shift+C** (Windows) or **Cmd+Shift+C** (macOS). Choose a parent by its code and path. The selected occurrence and its displayed descendants acquire independent locations. The link icon lists the locations of the shared item. Removing a location preserves its other occurrences. The confirmation identifies children that need to move to the root to keep their last location.

The first linked location upgrades the library's recovery JSON to schema 11. Use preview 11.1 or later on both computers and for reopening its recovery exports. An earlier single-parent release can reopen a pre-clone backup. Keep the original backup if you need that rollback path. Full-library backup, export and handoff include linked locations. To archive a linked branch independently, first remove its additional locations.

## Inline images in preview 11.2

Use **Insert image** in the formatting menu, paste from the clipboard, or drop a file between paragraphs. In Source, enter a Markdown image on its own line and switch back to Rich Text to import it. A new local path opens a file picker. Remote imports accept public HTTPS image URLs up to 256 MB. For larger or authenticated downloads, save the file locally and use Insert image.

Click an image to resize it. Its context menu controls alignment, caption, Alt text and replacement. Double-click opens the original in your default viewer. Opening an SVG externally asks for confirmation. Animated GIFs use the original animation. HEIC previews use the system decoder where available.

Use preview 11.2 or later on both computers **before adding the first image**. That first save upgrades the SQLite file version. After an exact-code manual handoff, a missing original shows a placeholder while the receiver waits for its matching file. A checksum mismatch stops activation. Prepare handoff and complete backups require all referenced originals, including originals referenced only in cold archives.

**Export document as Markdown…** creates a folder containing the document and its original images. Keep the assets folder with the document. **Clean unused images…** in Settings previews the recoverable space and protects images used by documents, archives, retained snapshots, verified handoffs and undo history.

## Automatic handoff verification in 11.3.1

Native tests use two isolated local installations and real SQLite databases. They cover four consecutive transfers in both directions, unchanged-revision reuse, committed edits surviving a simulated crash, offline publication, divergent local edits, corrupted manifests and objects, receipts arriving before manifests, and interruption after snapshot publication but before the closing receipt. The receiver retains its prior database on failure. Retrying reuses the immutable snapshot. Separate asset tests verify missing image rejection during automatic receiving, archive validation and compatible manual recovery.

Packaged-frontend tests cover local autosave, retained unsaved changes after a failed write, automatic idle publication, automatic retry after temporary unavailability, close/retry/cancel, manual preparation/resume and startup activation without code entry. UI regression tests cover the recent Planner, Outline, editor, date-picker and image-resizing fixes.

These tests simulate file transport locally. Windows execution and real OneDrive uploads, hydration and download delays still require the two-computer acceptance test. The integration cannot verify cloud freshness and therefore never displays **Synced**. A verified new clean-close snapshot opens automatically. If no newer snapshot is visible, the app asks you to wait/retry or explicitly work from the local copy.

Library settings stored in SQLite travel with the snapshot, including Planner settings and pinned items. Device preferences stored locally, such as appearance and the automatic snapshot idle delay, remain device preferences.

## Preview 11.3.4

Item markers replace visible codes in listings. Notes use a teal document icon; Todos use rose status markers. Recurring Todos, Milestones and Targets keep their special icons. Codes remain searchable, available in Details, and accessible through **Copy item code** in marker context menus. Planner completion retains its session/occurrence behavior.

Hierarchy guides and restored image widths now use CSP-compatible DOM styling. The permanent `tests/desktop-csp.cjs` test exercises the nonce-based desktop policy, including grouped/pinned hierarchy and image resizing across note switching, Source conversion and reopening. GitHub Actions runs it and marker interaction checks in Chromium and WebKit; the native repository suite also verifies saved image widths after reopening SQLite.

## Preview 11.3.5

Notes now use the shared Lucide file-text icon. Expanded pinned children respect Show inactive. **Ctrl+Alt+D** (Windows) / **Cmd+Option+D** (macOS) opens Jump to Date from any pane, with week numbers and the shared `@` date parser. That parser now also accepts relative day/week counts, end of month and named-month dates with a year. Navigation preserves a pinned Planner date and never schedules items.

## Preview 11.3.6

Outline and Pinned rows now offer Calendar and Daily Planner navigation icons for their own dates and work sessions. Repeating sessions contribute their next occurrence; explicit upcoming and ongoing sessions remain individually accessible. Planner navigation can preview another date without changing a saved pin, with a Return to pinned date action. Navigation does not modify item or session data.

## Preview 11.3.7

Includes the verified audit corrections and legacy storage-path cleanup. Cancelled reopening preserves the current library and pending edits. Recurring meeting moves, explicit Outlook cancellations and Planner validation have regression coverage. Installer creation now requires browser, native and cross-platform handoff checks.

Windows retains a pending close attempt until saving finishes or is cancelled. If another close request arrives after a prolonged pending operation, the app offers an explicit force-close warning; it never force-closes automatically. WebKit formatting shortcuts use the existing editor commands consistently.

See POST-CLEANUP-REVALIDATION.md for the full findings, evidence and platform-testing limits.
