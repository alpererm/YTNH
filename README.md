# YTNH

**Notes, todos and long-term planning, together in your own files.**

YTNH is a local-first desktop app for Windows and macOS. It combines a hierarchical Outline, a rich-text editor, a Calendar with a Daily Planner, and a five-year view of Targets in one workspace. Everything lives in a library file that you control. There's no account, server or telemetry.

## New to YTNH? Take the Tour

The first time you open YTNH, choose **Take the Tour**, or later **☰ → Open the Tour…**. It creates a practice library with short hands-on exercises that walk you through every part of the app in a few minutes. Your own libraries are never touched.

## What you can do

- **Organise in an Outline.** Notes and Todos side by side, nested as deep as you like, with headings that divide a project into sections, tags that children inherit, filters and grouping.
- **Finish things with satisfaction.** Completing a Todo ticks it, leaves it in place for a moment so you can undo, then moves it out of the way. Todos can also be Waiting for, On hold or Cancelled.
- **Write naturally.** Rich text with headings, lists (numbered from any number), checklists, quotes, tables, code blocks and images, with Markdown underneath and a Source view. Type `/` for a menu of blocks; select text for a formatting toolbar. Focus Mode hides everything but your writing.
- **Capture tasks inside your writing.** Type `<call the supplier>` in a sentence and it becomes a real Todo, with an optional date, parent and status, without leaving the sentence.
- **Link ideas.** Type `[[` to link or embed another item from suggestions that appear as you type; links survive renaming and moving, and every item shows its backlinks.
- **Plan your time.** Schedule items on the Calendar by dragging, repeat Todos daily, weekly or monthly, and plan the day hour by hour in the Daily Planner. Small icons in the Outline show what's scheduled, repeating, planned or overdue, and take you there. One set of status colours is used everywhere.
- **Think long-term.** Month-based Targets and week-based Milestones in a five-year view.
- **Find anything.** Search ranks title matches first, forgives typos, and understands `#tag`, `status:Done` and date ranges. Quick Open (Ctrl+Shift+Space) works even when YTNH is in the background.
- **Bring your notes and meetings.** Import a folder of Markdown files (subfolders, front matter tags and dates, images and links included) and meetings from an Outlook calendar export.
- **Work from the keyboard.** Shortcuts for nearly everything, shown in tooltips and menus; on macOS every command is also in the menu bar. See ☰ → Help.
- **Make it yours.** Paper White and Graphite Dark themes, fonts, interface and editor sizes, and a Calendar-first or editor-first layout.

## Download

Get the latest installer from [Releases](https://github.com/alpererm/YTNH/releases).

| Platform | File | Notes |
| --- | --- | --- |
| Windows | `YTNH_<version>_x64-setup.exe` | Installs for your user account. Needs the Microsoft Edge WebView2 runtime; the installer offers to download it. |
| macOS (Apple Silicon) | `YTNH_<version>_aarch64.dmg` | Open the disk image and drag YTNH to Applications. |

Installers are not code-signed yet, so Windows SmartScreen, macOS Gatekeeper or company policies may warn about or block them. Windows signing through SignPath Foundation is being set up; see [Code signing policy](#code-signing-policy).

## Your data

Your library is a single `.ytnh` file in a folder you choose, such as a OneDrive folder. While you work, changes autosave to a working copy on your computer; **Save** and closing the app update the library file. Keep extra copies with ☰ → Back Up Library…. If you sync the file between computers, let the sync finish before opening it elsewhere, and don't edit the same library on two computers at once.

YTNH doesn't send your data anywhere. It only goes online when you ask it to, for example to download an image from a web address you insert.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

Windows releases are built from this repository by GitHub Actions and signed only
after manual approval. Team roles, what is signed and the privacy policy are in the
[code signing policy](CODE_SIGNING_POLICY.md).

## Build from source

YTNH is a [Tauri 2](https://v2.tauri.app) app: the interface is `app.html` with a few plain JavaScript files, and the desktop shell and storage are written in Rust. There's no Node.js build step.

You need Rust, the Tauri CLI 2.12.4 and, on macOS, the Xcode Command Line Tools.

```sh
cargo install tauri-cli --version 2.12.4 --locked
cargo test --locked --manifest-path crates/library/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview
cargo tauri dev
cargo tauri build --bundles app,dmg   # macOS; use --bundles nsis on Windows
```

Installers are written to `src-tauri/target/release/bundle/`. Browser tests use Playwright and run in both Chromium and WebKit; see [tests/README.md](tests/README.md).

## More

- [Changelog](CHANGELOG.md)
- [Developer documentation](docs/development/): desktop notes, internals, and the storage design and verification records
- [License](LICENSE): MIT
