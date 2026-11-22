# Desktop development notes

Developer notes moved from the old README. They describe how the desktop shell is built and how it behaves; user-facing help lives in the app (☰ → Help) and in the main [README](../../README.md).

## Building installers with GitHub Actions

1. Open **Actions → Build desktop apps → Run workflow**. The default `main` branch
   also builds when updated.
2. When it succeeds, download `Windows-current-user` from the run's Artifacts.
3. Extract the download and run the `-setup.exe` installer on Windows. It installs
   for the current user, not all users. The installer checks for WebView2 and can
   download its runtime if missing. Corporate execution policies still apply.

GitHub produces an unsigned Windows installer. Windows may ask about its publisher;
this project does not disable or bypass company security controls. A signed build
can be added later. The macOS build uses ad-hoc signing for personal testing; it is
not notarized. The default macOS workflow targets Apple Silicon.

## Desktop behavior

Portable files use local autosave during editing and verified master publication on Save,
normal Close and library switching. A local save never proves cloud synchronization.

- New file and Open file select portable `.ytnh` masters. Recent files remember each device's local path.
- Failed master publication retains local work and offers Retry, Save As or Cancel as appropriate.
- Recover local portable library lists verified copies with explicit warnings for damaged entries.
- Restore SQLite backup and managed cold-archive restoration remain available.
- Complete recovery export and emergency JSON export are retained. JSON import is an offline operation, not an application menu action.
- Connect handoff folder, Receive handoff and Convert existing SQLite library menu commands have been removed with their unused native entry points.
- Already registered legacy libraries require explicit conversion of the verified local copy before editing. The prompt warns about paused/unpublished state and does not fetch remote handoffs. Cancelling keeps the current workspace. Old source files and backups remain retained.
- Clicking `file://` links opens the system's associated application (for example Visio
  on Windows). HTTP/HTTPS links open the default browser. Missing files show an error.
- Windows paths still require Windows; this does not translate OneDrive paths between computers.
- Closing the desktop window checks unsaved changes. No server, terminal, Python or
  development tools are required by the person using the packaged app.

## Focus shortcuts

Alt+1 (Option+1 on Mac) focuses Outline and leaves an open editor visible.
Alt/Option+2 opens the selected item's editor and restores its saved caret,
+3 shows Calendar, and +4 shows Targets. These work from text fields and app dialogs;
app dialogs are dismissed without confirming their actions.

## Source ownership and updates

Edit the files in this repository. `app.html` contains the shared UI, editor and
item model; `planner-*.js`, `planner.css` and `vendor/icaljs` supply the Planner.
`bridge.js` and `library-bridge.js` connect the UI to native commands.
`src-tauri/build.rs` bundles these sources into generated `web/index.html`.
Do not edit that generated file or replace `app.html` with an older OneDrive HTML.

Distribution is desktop-only. The source HTML remains useful for browser tests,
but it is not a separately shipped self-contained browser application. Each desktop
release contains its own bundled frontend; it never loads application code from
OneDrive at runtime.

## Local development on macOS

Install Rust, Xcode Command Line Tools and the Tauri CLI. No frontend framework,
Node package manager or Python build step is required.

```sh
cargo install tauri-cli --version 2.12.4 --locked
cargo test --locked --manifest-path crates/library/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
# Match the SQLite preview feature configuration when testing that build:
cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview
cargo tauri dev
cargo tauri build --bundles app,dmg
```

If using the project-local tools installed by Codex, use `scripts/cargo-local.sh`
instead of `cargo`. Build products are in `src-tauri/target/release/bundle/`.
The icon source is `icon.svg`; generated platform icons live in `src-tauri/icons/`.

## Scope

The desktop layer deliberately keeps editor, calendar, hierarchy, undo and recurrence
in the existing JavaScript. JSON operations are restricted to native-picker grants
and the previously selected database. No general-purpose shell execution or remote
web pages are exposed to the desktop bridge. HTML drag-and-drop is enabled by disabling
Tauri's competing native file-drop handling.

Cloud conflict detection is best effort: as with other local file editors, an external
writer could race the final filesystem rename. Avoid editing the same JSON simultaneously
on two computers; OneDrive synchronization is not a transactional database.
