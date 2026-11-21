# YuTaNoHe

**Notes, Todos and long-term planning—together, in your own files.**

YuTaNoHe is a local-first application for organizing notes, tasks, projects and milestones. It combines a hierarchical Outline, a rich-text editor and calendar planning in one workspace.

This repository is the public distribution home for manually downloadable YuTaNoHe desktop releases.

## Download

Open the **Releases** section of this repository and choose the download for your platform.

| Edition | Download | Getting started |
| --- | --- | --- |
| Windows | `*-setup.exe` | Run the installer. The application installs for your user account. |
| macOS — Apple Silicon | `.dmg` | Open the disk image and install the application. |

You do not need Node.js, Python, a terminal or development tools to use YuTaNoHe.

The Windows application uses Microsoft Edge WebView2. The installer checks for the runtime and may need an internet connection to install it. Your organization’s application policies still apply.

Check each release’s notes for supported platforms, signing status and any known limitations.

## What you can do

- **Organize hierarchically:** keep Notes and Todos together, with nested items, tags, search, filters and grouping.
- **Write naturally:** use rich text, headings, lists, nested checklists, links and basic tables, with Markdown Source mode available.
- **Plan work:** schedule items on the Calendar, use recurring Todos, and track long-term Targets and week-based Milestones.
- **Connect information:** link or embed existing items and follow backlinks to their source documents.
- **Create tasks inside sentences:** turn inline wording into real, UUID-linked Todos with their own status, schedule and parent.
- **Work from the keyboard:** navigate panes, move items, use Focus Mode and access desktop capture and Quick Open shortcuts.
- **Choose your appearance:** Paper White and Graphite Dark themes.

## Your data

Current portable-master releases use one `.ytnh` file containing a verified SQLite
snapshot and its required managed images and cold archives. Editing uses a separate
local SQLite working database. Use a release that supports portable masters to open it.

No YuTaNoHe account is required. This public repository does not receive your database.

### Saving and recovery

Autosave writes pending edits to the local SQLite working database after a short pause
and periodically during continuous editing. **Save**, normal **Close**, and switching
libraries publish a verified version to the portable master. Failed publication keeps
local work and offers recovery choices; do not discard it merely because the master is
unavailable.

Local backups and retained recovery copies are separate from the portable master. Use
**Recover local portable library…** or **Restore SQLite backup…** when appropriate.
Keep an independent copy of a complete master before an application upgrade. Recovery
JSON export remains available, but the app no longer imports historical JSON databases.

### OneDrive and other synchronized folders

The portable master may be stored in a compatible local or synchronized folder.
YuTaNoHe checks its fingerprint before replacing it and refuses known conflicts.
The working SQLite database stays local to the computer.

**A local save does not confirm cloud synchronization.** Close and save on the first
computer, allow your storage provider to finish synchronization, and then open the
master on the other computer. Avoid simultaneous editing. YuTaNoHe does not coordinate
cloud transfers, merge divergent edits or use handoff codes.

## Manual updates

YuTaNoHe does not automatically check for, download or install application updates. Download a new version from this repository’s **Releases** section whenever you choose.

Before installing:

1. Read the release notes for compatibility requirements, known limitations and any migration steps.
2. Save your work successfully. If saving fails or reports a conflict, resolve it or preserve a recovery copy before continuing.
3. Keep a separate backup of your database and all required images, attachments and archive files. For portable-master releases, retain a complete `.ytnh` master and available recovery backups.
4. Close YuTaNoHe, then install the Windows installer or macOS disk image for your platform. You do not need to uninstall the existing application first.
5. Reopen the application and verify that your existing data and configured file location are available before continuing work. Follow the release-specific instructions if the storage format has changed.

Application installation and database migration are separate operations. Installing a newer version does not by itself convert an older JSON database or guarantee that every older database format can be opened directly.

Manual upgrade, uninstall and downgrade safety must be verified for the specific release; do not assume that they are interchangeable or that an older application can read data saved by a newer one. Keep the previous installer and an untouched pre-upgrade backup. If recovery is necessary, preserve the current data and recovery files before following the release’s recovery instructions; do not overwrite your only copy or open the active database with an older version without confirmed compatibility.

A successful local save does not confirm that OneDrive or another synchronization service has finished uploading your files.

## Useful desktop shortcuts

| Action | Windows | macOS |
| --- | --- | --- |
| Quick Open | `Ctrl+Alt+K` | `Cmd+Option+K` |
| Capture a Todo | `Ctrl+Alt+T` | `Ctrl+Option+T` |
| Capture a Note | `Ctrl+Alt+N` | `Ctrl+Option+N` |
| Focus Outline | `Alt+1` | `Option+1` |
| Focus editor | `Alt+2` | `Option+2` |
| Show Calendar | `Alt+3` | `Option+3` |
| Show Targets | `Alt+4` | `Option+4` |
| Filter today’s Outline items | `Alt+Shift+T` | `Option+Shift+T` |

Global Quick Open and capture shortcuts require the desktop application to be running. Another application or the operating system may already use a shortcut.

See **Help** inside the application for the full shortcut list.

## Report a problem

If Issues are enabled in this repository, include:

- The application version shown in **About**.
- Your operating system and desktop application version.
- Steps to reproduce the problem, plus the expected and actual behavior.
- The exact error message, if available.

Please use a small example database with invented content when sharing a reproduction. Do not upload your personal or work database, private file paths, credentials or confidential screenshots to this public repository.
