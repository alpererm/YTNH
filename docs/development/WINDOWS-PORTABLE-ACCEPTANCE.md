# Windows portable-master acceptance — Stage 4

**Status: NOT RUN / NOT PASSED.** Prepared 15 November 2026.

The available host is macOS ARM64. No accessible Windows machine, Windows VM, Wine or
PowerShell runtime was found. No Windows installer was produced or executed in this stage.
Mac tests and browser simulations are not Windows acceptance. Stage 5 remains pending.

This procedure uses synthetic data only. It does not authorize pushing to GitHub,
releasing, or installing over the normal application. Record PASS, FAIL or BLOCKED for
each case, with evidence. Do not infer a pass from source review or a successful build.

## 1. Build an isolated installer on a Windows builder

The work laptop does not need development tools. Build on a separate authorized Windows
builder with Rust, Microsoft's C++ toolchain, Node (for browser tests) and Tauri CLI 2.12.4.
A hosted build would require separate authorization to transfer/push this uncommitted
source. Current GitHub main alone does NOT contain the portable-master changes.

Use a clean copy of the CURRENT working tree, including the untracked portable modules
and tests, but excluding `.build-tools`, `target`, generated `web`, personal data and
credentials. Record baseline commit, full diff, untracked source files and source hashes.
The unchanged About version 11.3.7 is insufficient to identify this validation build.

From that source-copy root in PowerShell, create a temporary config; do not edit the
production configuration:

```powershell
$ErrorActionPreference = 'Stop'
$config = Join-Path $env:TEMP 'ytnh-windows-portable-validation.json'
@'
{
  "productName": "YuTaNoHe Portable Validation",
  "identifier": "com.localnotestodos.portable-validation",
  "app": {
    "windows": [{
      "label": "main", "title": "YuTaNoHe Portable Validation",
      "width": 1400, "height": 900, "minWidth": 800, "minHeight": 550,
      "dragDropEnabled": false
    }]
  }
}
'@ | Set-Content -LiteralPath $config -Encoding ASCII
cargo test --locked --manifest-path crates/library/Cargo.toml
if ($LASTEXITCODE) { throw 'Shared native tests failed' }
cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview
if ($LASTEXITCODE) { throw 'Desktop native tests failed' }
cargo tauri build --config $config --bundles nsis
if ($LASTEXITCODE) { throw 'Windows packaging failed' }
Get-ChildItem src-tauri/target/release/bundle/nsis/*-setup.exe |
  Get-FileHash -Algorithm SHA256
```

Use a clean build output directory so an old installer cannot be mistaken for this one.
Retain build logs and the exact installer SHA-256. Preserve current-user NSIS installation,
WebView2 bootstrapper behavior, image feature and CSP; no permissions/security relaxation.
The validation product name and identifier isolate its installer and app/WebView storage.

## 2. Installation and permissions (W01)

Use a standard Windows account, ideally a disposable account/VM. Close other YuTaNoHe
instances normally to avoid global-shortcut conflicts. Do not force-close the user's app.

- Run the named validation installer normally, without Run as administrator.
- Record Windows edition/build, architecture, account privileges, WebView2 version,
  installer hash, actual installation directory and any prompt/error text.
- It must identify **YuTaNoHe Portable Validation**, not the production/Preview product.
  Cancel if it proposes replacing either of those installations.
- Confirm the installed shortcut launches the installed validation executable, not a
  loose build binary. Test relaunch and the installed uninstaller at the end.
- Check a machine with WebView2 installed. Test missing-WebView2 installation separately
  if available; record BLOCKED if bootstrapper networking or enterprise policy prevents it.
- If SmartScreen, AppLocker, antivirus or corporate policy blocks execution, record BLOCKED
  and the exact message. Do not disable protection, remove security flags or elevate to
  bypass the block. A policy block does not prove application operation or data safety.

Expected storage, derived from `app_local_data_dir()` and the validation identifier:

```
%LOCALAPPDATA%\com.localnotestodos.portable-validation\
  libraries-v1\catalog.json
  libraries-v1\writer.lock
  libraries-v1\portable-v1\sessions\<library-UUID>.json
  libraries-v1\portable-v1\copies\<copy-UUID>\library.sqlite
  libraries-v1\portable-v1\copies\<copy-UUID>\objects\...
  libraries-v1\portable-v1\publications\<publication-UUID>\...
  libraries-v1\portable-backups\<library-UUID>\...
```

For example, `C:\Users\Tester\AppData\Local\com.localnotestodos.portable-validation\...`.
Production `com.localnotestodos.desktop` and Preview storage must remain untouched.
Do not override HOME/AppData or point the validation app at a real library.

## 3. Synthetic fixture and native pickers (W02)

Create a unique test directory outside application storage, first on ordinary local NTFS:

```powershell
$run = [guid]::NewGuid().ToString()
$testRoot = Join-Path $env:USERPROFILE "YuTaNoHe-SYNTHETIC-VALIDATION-$run"
New-Item -ItemType Directory -Path $testRoot | Out-Null
$master = Join-Path $testRoot 'Synthetic ü Library.ytnh'
'Synthetic linked attachment only' | Set-Content (Join-Path $testRoot 'Example attachment.txt')
```

Use New file in the installed app and select exactly `$master` in its native picker.
Create a Note `Synthetic parent`, child Todo `Synthetic task`, a recurring Todo, a Target
and Milestone. Add tags, a schedule date, a Planner work session and a meeting. Put bold
text, a checklist, a table, an internal item link and a link to Example attachment.txt in
the Note. Use only invented titles/content. Insert a locally generated PNG/JPEG and SVG
without scripts/external references. Pin one item and create a linked placement if available.

- Confirm open/save pickers handle spaces and Unicode paths and retain `.ytnh`.
- Cancel Open and Save As: current model, selection, caret and unsaved edits must remain.
- Save As must refuse an existing destination without changing its hash, even if the native
  dialog offers replacement. A new destination must reconnect only after successful save.
- Close and reopen by Open file and by Recent files; verify identities/hierarchy/content.

Repeat core create/save/reopen checks in a NEW synthetic OneDrive subfolder after local
checks pass. Record its resolved path. Never choose an existing real master. Local write
success is not proof of cloud synchronization or another computer receiving the file.

## 4. Autosave and master publication (W03)

Important: automatic autosave writes LOCAL SQLite after 2 seconds idle, and at least every
15 seconds during continuous editing. The portable master updates on manual Save, normal
Close and library switching. It is not rewritten after every edit.

1. Save a baseline; record `(Get-FileHash -LiteralPath $master).Hash`.
2. Type a unique sentence. Wait at least 3 seconds. Expect locally saved/master pending;
   verify master hash is unchanged. Inspect validation `catalog.json` read-only: each
   `libraries.<UUID>.copy` must resolve beneath the validation local `copies` directory,
   not beside the master or inside OneDrive. Do not edit catalog or SQLite files.
3. Type continuously for >20 seconds. Confirm local autosave occurs during typing and
   caret/undo are preserved. Native test logs must also cover the timing contract.
4. Ctrl+S: expect actual master-save success and a changed master hash. Open its ZIP
   structure READ-ONLY using an archive viewer: manifest, library.sqlite and required
   objects must exist. Do not extract/open live SQLite in OneDrive or edit the package.
5. Change title/body/status/tags/date and close immediately via the window X. It must flush
   pending input/local writes, publish, then exit. Relaunch and verify every final edit.
6. Repeat using Alt+F4 and switching to a second SYNTHETIC library. Verify no premature
   exit/switch or lost edits. Cancel a failing switch and retain the first library.
7. No-change Save must leave master hash AND last-write timestamp unchanged.

To separately prove local recovery before publication, on disposable data only: after
step 2 reports local success, record the validation process's exact PID/executable path,
then end ONLY that process using Task Manager. Relaunch: locally saved text must survive
with master still pending; Save must publish it. Do not use a process-name-wide kill.
This tests process interruption after local saving, not physical power loss.

## 5. Replacement, locks and failed close (W04)

Use the same open synthetic master, with a new edit pending before every failure case.
Keep PowerShell running only for the duration of each lock test.

**Replacement denied while reads are allowed:** Windows sharing flags can reproduce a
replacement failure without corrupting the master:

```powershell
$held = [System.IO.File]::Open($master, [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
# In the app: make an edit, then Save or close. Observe failure dialog.
# After the observations below, release the lock:
$held.Dispose()
```

While held, Save/close must not overwrite/truncate the file, exit, or report Master saved.
The previous master hash and local edits must remain intact. Test Cancel Close, then
release and Retry. Repeat and choose Save As to a new path: it must succeed without
changing the locked old master. Restore `$master` to the newly connected path afterward.
Always release handles, including after a failed observation.

**Read-only master:** `attrib +R "$master"`; edit, close, inspect failure and Cancel Close.
Run `attrib -R "$master"` afterward, then Retry. Never alter broad directory permissions.

**Missing master:** rename the synthetic master while app is open. Edit and close:
expect failure, retained work, no silent recreation. Rename it back and Retry.

**Unavailable local SQLite write:** first save normally; identify the CURRENT copy via
validation catalog. Hold that file exclusively with the same File.Open call above using
`FileShare.None` (only if Windows grants the handle). Edit and wait. Expect failed local
save, retained in-memory edits and Retry/Cancel; do not offer a misleading master Save As
before local saving succeeds. Release the handle and Retry, then reopen and verify.
If an existing SQLite handle prevents obtaining this lock, mark this injection BLOCKED;
do not change ACLs on the user's profile to force it.

Start a second validation process while the first owns storage. It must not obtain a
second writable local store. Record actual error presentation and verify neither process
silently discards data. Close the second process only.

Do not deliberately terminate during replacement on the first acceptance run. Run the
native fault-injection tests listed in section 1, and mark real mid-publication termination
and physical power-loss behavior separately unverified unless controlled tests are run.

## 6. Conflicts, malformed masters and recovery (W05)

- Save the baseline master; retain an external byte-for-byte copy. Save a newer revision.
  While the app remains open, copy the OLD baseline over this SYNTHETIC master and make a
  local edit. Save must reject the changed master. Record its hash before/after the rejected
  save. Cancel must retain the editor; Save As to a new path must preserve the local edit.
- Close normally, then rename the connected synthetic master and relaunch. Expect
  Portable master unavailable with Retry / Recover local work / Cancel. Cancel must not
  activate a different library. Recover local work must retain the warning/pending state;
  Save As must produce a verified new master. Restore the held original separately.
- Make a separate truncated COPY of a master and attempt Open. It must be rejected and
  leave the currently active library unchanged. Never truncate the sole valid copy.
- Use Recover local portable library to select a retained copy explicitly. Verify a
  different dirty current library/copy is protected and no copy is chosen by timestamp.
- Exercise Restore backup on synthetic data; verify content/assets and safe revision
  behavior. Retain evidence and all recovery copies; no automatic cleanup is part of this test.

## 7. Images, attachments and UI (W06)

After Save/close/reopen, verify the inserted image, its resized dimensions, alt text and
Source/Rich round trip. Open the image with the native viewer; restore an archived test
item with its image. Confirm no CSP errors/blank image/vanishing connectors. Test a paste
image and file insertion. Include a synthetic managed cold archive in the publication.

External file links are NOT packaged attachments. The Example attachment.txt link should
open while its original file exists. Move that file and confirm the missing-file behavior
without losing document content; do not expect the app to embed arbitrary linked files.

Representative UI: edit title/body, undo/redo, lists/table, image resize, Outline hierarchy
and linked placements, search, filters, both themes, Calendar schedule, recurring occurrence,
Planner drag/resize/completion, Targets and keyboard pane navigation. Save/reopen and verify
shared identities, dates, recurrence and managed assets survive. Compare a recovery export
before/after for unintended changes; account for expected edits/revision timestamps.

## 8. Evidence and exit criteria

Record each W01–W06 as PASS / FAIL / BLOCKED. Attach installer/source hashes, Windows and
WebView2 versions, test paths, native logs, screenshots of dialogs, exact reproduction
steps and master hashes. Do not include user data. A packaged launch alone is not W03–W06.

Uninstall ONLY the validation product using its installed uninstaller. Confirm normal
YuTaNoHe remains installed and synthetic master/recovery data is not silently removed.
Retain synthetic artifacts until review; cleanup is not authorized by this checklist.

**Windows remains NOT PASSED until the real installer and these workflows are executed.**
Any failing data-safety case blocks Stage 5. Actual two-computer cloud transfer and cloud-only
hydration remain additional acceptance checks, even if every local Windows case passes.

## Current source anchors

- Installer/features/CSP: `src-tauri/tauri.conf.json`.
- Native selection and local root: `src-tauri/src/libraries.rs`, `dispatch`.
- SQLite/local copy ownership: `crates/library/src/portable.rs`, `WorkingStore`.
- Snapshot checks, durable receipt, same-directory replacement: `portable/publication.rs`,
  `WorkingStore::publish`; dependency `NamedTempFile::persist`, no truncate fallback.
- Save/close recovery dialogs: `library-bridge.js`, `savePortable`, `openPortable`,
  `beforeSwitch`, `closeDecision`; native close dispatch in `src-tauri/src/main.rs`.
- Native scenarios: `crates/library/tests/portable.rs` and publication unit tests;
  host tests in `src-tauri/src/libraries.rs`. Browser simulation: `tests/portable-desktop.cjs`.
