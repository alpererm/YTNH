# YTNH

**Notes, todos and long-term planning, together in your own files.**

YTNH is a local-first desktop app for Windows and macOS. It combines a hierarchical Outline, a rich-text editor and calendar planning in one workspace, and keeps everything in a library file that you control. There's no account, server or telemetry.

## What you can do

- **Organise in an Outline:** Notes and Todos side by side, nested as deep as you like, with tags, search, filters and grouping.
- **Write naturally:** rich text with headings, lists, checklists, quotes, tables, code blocks and images, with Markdown underneath and a Source mode.
- **Plan your time:** schedule items on the Calendar, repeat Todos, plan the day in the Daily Planner, and import meetings from Outlook.
- **Think long-term:** month-based Targets and week-based Milestones in a five-year view.
- **Connect ideas:** link or embed other items, follow backlinks, and turn wording inside a sentence into a real Todo.
- **Work from the keyboard:** shortcuts for nearly everything; see ☰ → Help → Keyboard shortcuts in the app.
- **Bring your notes:** import a folder of Markdown files, subfolders, tags, images and links included.
- **Learn by doing:** ☰ → Open the Tour… creates a practice library that walks you through the app.

## Download

Get the latest installer from [Releases](https://github.com/alpererm/YTNH/releases).

| Platform | File | Notes |
| --- | --- | --- |
| Windows | `YTNH_<version>_x64-setup.exe` | Installs for your user account. Needs the Microsoft Edge WebView2 runtime; the installer offers to download it. |
| macOS (Apple Silicon) | `YTNH_<version>_aarch64.dmg` | Open the disk image and drag YTNH to Applications. |

Installers are currently not code-signed, so Windows SmartScreen, macOS Gatekeeper or company policies may warn about or block them. Signing through SignPath Foundation is being set up; see below.

## Your data

Your library is a single `.ytnh` file in a folder you choose, such as a OneDrive folder. While you work, changes autosave to a working copy on your computer; saving, and closing the app, update the library file. If you sync the file between computers, let the sync finish before opening it elsewhere, and don't edit the same library on two computers at once.

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

Installers are written to `src-tauri/target/release/bundle/`. Browser tests use Playwright; see [tests/README.md](tests/README.md).

## More

- [Changelog](CHANGELOG.md)
- [Developer documentation](docs/development/): desktop notes, internals, and the storage design and verification records
- [License](LICENSE): MIT
