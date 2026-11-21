# Portable master storage — Stage 2

> Historical stage/report. Current behavior and verification are documented in
> [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md). Retired handoff instructions
> are not the current portable-master workflow.

Historical Stage 2 checkpoint. Stage 3 integration and current verification are recorded
in `PORTABLE-MASTER-STAGE3.md`.

Status: implemented behind library APIs; not connected to the live application's Open,
autosave or Close commands. Existing handoff operation remains intact. No user library
has been converted. No master-replacement operation exists in this stage.

## Scope and integration boundary

`crates/library/src/portable.rs` provides:

- `create`: consistent SQLite snapshot plus complete required object inventory; verified
  **new-file-only** output. Existing destinations are never overwritten.
- `verify`: local staging, ZIP/header/path/resource checks, SHA-256 checks, existing
  database/revision validation, archive semantic validation, and complete image inventory.
- `WorkingStore::load`: activate verified local generations; preserve unpublished edits;
  reject stale/divergent masters and external changes conflicting with local work.
- `recover` and `recovery_copies`: inspect durable local data without requiring the master
  to exist. Retained generations are never selected by timestamp or deleted automatically.

The host must hold the WorkingStore lock for the full editing session and supply a
local application-controlled root. Stage 3 must connect the existing UI/save queue,
local backup policy, native file pickers, and failed-close workflow before this becomes
an end-user editing mode. It must not open the new mode for live editing while the old
handoff adapter still owns save/close behavior. Main/Preview discovery/conversion UI
also belongs to that integration, not automatic conversion of installed libraries here.

Existing model, schema, editor, undo, image serialization, and handoff implementation
are unchanged. Two existing revision helpers became crate-visible for reuse.

## Format v1

A `.ytnh` file is a single-volume ZIP64-capable archive using only stored entries:

```
manifest.json
library.sqlite
objects/<lowercase SHA-256>
```

The manifest contains format/version, exact snapshot revision state, SQLite schema
version, database checksum/length, and a deduplicated required-object inventory.
Checksums establish integrity, not cryptographic authenticity or encryption.

Required cold archives and images referenced by active documents, cold archives and
Planner meetings are included. External `file://` links stay external; preview caches
and independent local backups are not embedded. Unreferenced source files are not deleted.

Version 1 rejects compressed/encrypted entries, symlinks, directories, extra entries,
unknown format versions, duplicate names, header inconsistencies, archive comments,
and multi-volume ZIPs. This is a YuTaNoHe format, not a general ZIP import feature.

Default limits: 64 GiB package/expanded payload, 100,000 entries, 8 MiB manifest,
32 MiB ZIP directory metadata. Limits fail explicitly, never truncate. Packaging and
hashing stream data. Existing SQLite model and archive semantic validators still read
individual models/archives into memory; large-library resource acceptance is not yet
certified. Disk-space failures propagate without replacing an existing master.

Dependency: zip 9.6.0, default features disabled; Rust >=1.88 is needed by that dependency.
Current local toolchain and CI stable satisfy this. Existing serde and fs2 dependencies
are reused directly by the shared crate. Both Cargo locks include the dependency graph.

## Local durability and recovery

The host chooses a local root containing `writer.lock`, `sessions/`, `copies/`, `staging/`.
A per-store exclusive lock prevents two cooperating writers to that root. It is not a
cloud lock or a guarantee across independently configured stores/app identities.

Each activation has a new UUID directory, verified database/objects and a durable
session receipt. Files are flushed before directory activation and pointer replacement;
Unix directory entries are flushed too. Windows power-loss/directory durability remains
subject to native filesystem guarantees and Stage 4 testing.

Copies are retained when pointer activation fails. Recovery enumeration reports such
copies explicitly. Missing pointers with unpublished edits block fresh activation.
Malformed recovery data fails closed rather than being repaired or silently ignored.
An unchanged master preserves dirty local work; a changed master blocks it. A clean
copy accepts only a verified same-history descendant (or an identical revision).
Selecting another path to the identical master updates the local path without resetting
pending local work. A corrupt/offline master never deletes the local working copy.

Stage 3 must add a durable pending-publication record and reconciliation for interruption
between master replacement and recording publication success. Stage 2 deliberately does
not claim that such publication or normal-close behavior already exists.

## Verification

Run from the repository root:

```
cargo test --locked --manifest-path crates/library/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview
```

The normal library test command automatically includes `tests/portable.rs`; no CI gate
is bypassed or removed. Tests use only disposable synthetic libraries and local folders.
They cover exact model/UUID/archive/image round trips, image dimensions, Planner-only
and archive-only images, corruption, missing files, invalid manifests/paths/duplicates,
truncation, resource limits, stale/divergent histories, local edits across restart,
missing master recovery, exclusive locking, relocation, and interrupted-activation state.

Interrupted activation is simulated by removing a synthetic session pointer, not by
claiming a physical power-failure test. Packaged Windows/macOS and real cloud-folder
acceptance remain Stage 4. No real user files or live cloud folders are test inputs.

## Next approval boundary

Stage 3: native picker/adapter integration, automatic verified master replacement on
normal close, explicit Manual Save, pending-publication recovery, Retry/Save As/Cancel
Close, and preserving the existing local backup protections. No automatic deletion of
new recovery generations; retention requires separate approval. Existing backup rotation
must not be silently extended to new recovery copies.

Rollback before rollout: remove the additive module/tests/dependencies and restore the
two helpers' visibility; no user-library schema or data rollback is necessary. Do not
commit, push, release, convert real data, or replace the installed app without approval.

## Actual local results (15 November 2026)

- Shared-library tests: 36 passed, including 21 new portable-master cases.
- Desktop-native tests with packaged image feature: 17 passed, one existing optional
  storage-growth diagnostic ignored.
- Installer safety-gate checks: passed (including 4,096 simulated prerequisite outcomes).
- New Rust files: formatting check passed. Repository-wide formatting check also reports
  pre-existing formatting differences; unrelated files were not reformatted.
- iOS simulator compile check: blocked before library validation because this computer
  lacks Apple's `iphonesimulator` SDK. The Rust target is installed; that is insufficient.
- No packaged app, Windows runtime, real cloud folder or power-loss test was run.
- No UI changes, installed-library access, conversion, commit, push or release.

The ZIP dependency's documented security guidance was reviewed. Header consistency is
explicitly enforced, codecs are disabled, extraction never uses archive-selected paths,
and central-directory allocation is bounded before ZIP indexing. This is implementation
review and synthetic testing, not a claim of an independent security audit.
