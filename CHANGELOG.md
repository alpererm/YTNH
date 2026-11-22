# Changelog

User-visible changes to YTNH. Older entries keep their original wording; names such as "Local Notes & Todos", "database" and "master" refer to how the app was called at the time.

## Unreleased

- Renamed to YTNH, with "library" wording throughout and a standard About window.
- Flat application menu with keyboard shortcuts shown; Settings open with Cmd+, (macOS) or Ctrl+, (Windows) and apply instantly.
- New shortcuts: Cmd/Ctrl+1–4 for panes, Cmd/Ctrl+N and Cmd/Ctrl+T for new items, Cmd/Ctrl+O to open, Cmd/Ctrl+Shift+S to Save As, Cmd/Ctrl+Shift+D for the Daily Planner, F11 for Focus Mode, Delete in the Outline. Alt/Option shortcuts no longer block typing AltGr or Option characters.
- One system-wide Quick Open shortcut (Ctrl+Shift+Space) that can be turned off, replacing Ctrl+Alt+T/N/K.
- Editor: clearer heading sizes, paragraph spacing, real code blocks, joined quotes, smaller checkboxes with a tick, tags as removable chips.
- Calendar and Targets fit their pane, a stronger "today", month title, year labels, and readable Daily Planner blocks with a red now-line.
- Two panes at every window size; centred Focus Mode; faster Outline redraws in large libraries.
- Outlook imports skip and report meetings in unknown time zones instead of failing.
- Accessibility: the Outline is a single Tab stop announced as a tree; dialogs are announced as dialogs.
- Rewritten Help with search and grouped shortcuts.
- The YTNH Tour: a practice library with hands-on exercises, offered on the welcome screen and under ☰ → Open the Tour….
- Import Markdown Folder…: a folder of Markdown files becomes Notes named after the files, with subfolders as parent Notes, front matter tags and dates, copied images and working links between the files.
- Headings inside projects, Things-style completion with a short undo window, and quieter Outline arrows with deeper indentation.
- Outline icons for scheduled, recurring and planned items, with date tooltips; the clock steps through planned sessions and never moves a pinned Planner date.
- Search results are ranked the same way everywhere (Outline search, Quick Open, link and parent pickers): titles before text, whole words before partial ones, active before finished; typo matching handles swapped letters and half-typed words; finished items stay findable in pickers, dimmed.
- Slash menu ("/" at the start of a line), [[ suggestions at the caret, and a formatting toolbar for selected text.
- Native macOS menu bar with every command; Windows keeps the ☰ menu.
- Settings in four tabs (General, Appearance, Editor, Calendar).
- Alt+Shift+C (⌥⇧C) clears all filters, like the Clear all button; the selected Calendar day has a thin outline.
- One status colour palette everywhere: graphite open, accent Done, amber Waiting for, violet On hold, grey Cancelled, teal meetings; red only for overdue dates. Accent-coloured list markers.
- Numbered lists keep the number you start them with; the Tour explains inline Todos and shows Mac and Windows shortcuts.
- Consistent toolbars with SVG icons, softer pane separators, a growing search field and an optional "Scroll past end".

## Earlier releases

## Historical validation and release notes

The entries below describe their original release state, not current certification.
For current repeatable checks and their limits, see [tests/README.md](tests/README.md).

### Validation of the first desktop build

- Native Rust tests cover exact JSON writes, conflict rejection, invalid writes, and file grants.
- The shared standalone app passes the existing recovery and editor suites.
- Desktop bridge tests run in Chromium and WebKit with a simulated native command transport.
- The macOS application and DMG compile and package successfully with ad-hoc signing.
- The macOS app process launches. Native UI inspection was unavailable in this session,
  so actual native dialogs and desktop-file launching still need a manual smoke test.
- Windows compilation and runtime verification require the first GitHub Actions run.

Before using your working database in the desktop app, open a disposable copy and verify:
Open, edit, Save, reopen, Backup, a local document link, and cancelling an unsaved close.

### Version 10.2.0

About in the application menu shows the application version, separately from JSON schema 10. Recent files remembers up to ten previously opened or saved JSON locations; file contents are read from disk when opened, and switching still checks unsaved changes.

macOS focus history uses Command+[ and Command+]. Windows retains Alt+Left/Right. In the rich editor, Ctrl/Command+K adds or edits a URL/file link with a Show as label, and Ctrl/Command+Shift+Enter toggles selected checklist entries. Type `[] ` to start a checklist. Tab/Shift+Tab nests/un-nests list and checklist selections; the existing platform paragraph movement shortcuts also work on selections.

CI uses the [Tauri-recommended Rust cache](https://v2.tauri.app/distribute/pipelines/github/), with explicit workspace mapping and a versioned packaging-tool key. The pinned Tauri CLI is reused when its version matches; Cargo lockfile/toolchain/platform inputs continue to invalidate dependency caches. There is no frontend package manager or dependency installation to cache: the frontend is bundled from repository HTML, JavaScript and CSS. Windows NSIS per-user installer artifacts remain unchanged.

### Version 10.3.0

While the desktop app is running, Ctrl+Alt+T and Ctrl+Alt+N bring it forward and start a new root Todo or Note in the current database. Open or create a database first. Capture does not automatically save. Existing dialogs must be finished before capturing.

Desktop zoom: Ctrl+Plus/Minus on Windows, Command+Plus/Minus on macOS, and Ctrl/Command+0 to reset. Zoom ranges from 50% to 250%. Windows scrollbars fade after scrolling; pane borders remain outside the scrolling content.

Editor list shortcuts: Ctrl/Command+Shift+7 = numbered list, +8 = bullet list, +9 = checklist. Physical number keys are used so shifted keyboard symbols do not break them.

### Compact formatting palette

Formatting uses four icon columns with independent active indicators and a compact Clear formatting footer. All icons are embedded SVGs and work offline. Mixed text selections show a format as active only when all selected text has it.

macOS global capture: Control+Option+T (Todo) and Control+Option+N (Note), while the app is running.

Windows uninstall: the existing per-user NSIS installer creates `uninstall.exe` in the installed app folder and registers it in Windows Installed apps. Run that file or use Windows Settings to uninstall. The uninstaller is generated during installation; it is not a separate portable download.

### Version 10.3.2

Formatting uses aligned icon rows without visible group headings; hover or keyboard focus shows tooltips. Source mode fits within the document viewport and scrolls internally. Native capture queues window actions after the OS hotkey callback returns. Registration conflicts are shown on startup and in About; unsuccessful registrations retry when the app regains focus. Windows native shortcut delivery still needs confirmation on Windows.

### Version 10.3.3

Settings in the application menu provides theme, an offline system-font selection, separate interface/editor sizes, a preview, and restore defaults. Preferences are saved locally on the device, outside the notes JSON; Cancel and Escape discard unapplied changes. Existing file theme is respected until a device preference is saved. Source and code blocks retain their monospace fonts.

### Version 10.4.0

Todos can now have an optional Milestone property with one ISO Target Week. Enable it in the editor; milestones appear in a wrapping strip above that week's Calendar days. Click to highlight descendants (nearest Milestone ancestor), click again or press Escape to clear, double-click to edit, or drag to another week. Hover for title, code, week and status. Target bars show Done/Total milestone counts, using the nearest Target ancestor and excluding archives. Milestones do not create scheduled dates or automatically complete any item.

Alt/Option+Shift+D toggles Show done in HTML and desktop versions. After clicking a calendar day to filter the Outline, Left/Right steps one calendar day while preserving other filters; Escape clears the day filter. Text-field navigation and modified arrow shortcuts remain unchanged.

The optional `milestone: {targetWeek: "2027-W04"}` field is a backward-compatible extension to schema 10; absent/null metadata means an ordinary Todo. Validation rejects nonexistent ISO weeks and metadata on Notes. Existing JSON needs no rewrite or migration. Archive payloads, conflict detection and undo snapshots preserve the field. No build or packaging changes.

### Version 10.4.1

Outline rebuilds preserve scroll position when switching or creating items with the editor open, while offscreen active rows remain reachable. Removed item disclosure arrows and their spacer; Left/Right still collapses/expands branches. Milestones show `w45/26`; Targets show `11/26-02/27`.

Type → Targets includes descendant milestones and their ancestor path. Group by → Target preserves hierarchy within the nearest Target, places nested Targets in separate groups, and places No Target last. Existing visibility/search filters still apply. Alt/Option+Shift+R toggles recurring-item visibility using the existing Recurrence filter (also clears legacy hide-recurring state when showing them).

### Version 10.4.2

Outline titles retain their three-line limit and now use the full space after the code. Tags, milestone weeks (`W45/26`), Target ranges (`Nov 26 – Feb 27`) and recurrence indicators wrap underneath in smaller muted text; rows without metadata remain compact. Target grouping renders the actual Target row as its heading, with the existing count and a separate collapse button. The heading uses the original UUID and shared selection, editing, drag and context handlers. No data-model, storage, calendar, or grouping-membership changes.

### Version 10.4.3

Target, Milestone and recurrence icons sit beside Outline titles, including Target group headings. Dates and tags remain below; Target icons no longer precede item codes.

### Version 10.4.4

Pane resizing saves the exact displayed split percentage, avoiding a width shift after saving or reopening JSON. Clicking the splitter without dragging leaves the saved split unchanged.

### Version 10.5.0

Ctrl+Shift+Right (Command+Shift+Right on macOS) zooms into the focused Outline branch; Left with the same modifiers returns to the previous scope. The branch root is left-aligned, and Calendar/Targets visibility is scoped to the same UUID subtree. Zoom is temporary and is not stored in JSON. Filters remain active; grouping is temporarily replaced by hierarchy and returns on zoom-out. A scope bar provides a mouse-accessible Zoom out button. Creating a Note/Todo while the zoom root is focused creates it inside that branch.

Promoting an item places it immediately after its former parent (or its former root for the existing root-promotion action), preserving surrounding sibling order instead of appending at the end.

### Version 10.5.1

Rich-editor paste keeps the caret visible, including formatted content. Checklist caret positions are constrained to the text side of the checkbox. Branch zoom uses a smaller, unfilled scope indicator. Day-filter ancestor context is faded. Completing an Outline item now removes it immediately when Done is hidden and focuses the next visible item; context parents remain where needed. Plain calendar day clicks filter that day; Ctrl-click (Command-click on macOS) schedules the selection. Drag/drop semantics are unchanged.

### Version 10.5.2

Typing `[[` or `![[` in rich-editor text opens the existing item-link or embed picker; choosing an item replaces the trigger. Per-item editor caret/selection, Source mode and scroll position are retained through focus history and saving. Existing history shortcuts remain unchanged. Week inputs use native dark-mode styling. Editor properties are content-sized, scroll only when needed, and adapt to the right-pane width; the writing area takes the remaining space. Add scheduled date stays beside its Add button. Repeat remains available for Todos; dependent recurrence controls are hidden only when recurrence is off, with stored recurrence and occurrence data unchanged by visibility.

### Version 10.5.3

The editable title shares the editor header with the code, formatting, Source and Details controls. Status, scheduled date and explicit tags share a compact row, wrapping tags below on narrow panes. Picking a date registers it immediately; keyboard date entry waits for Enter. The Add button is removed. Scheduled-date chips appear below the date input, retaining removal and date-jump behavior.

### 10.5.4
Global capture selects the Outline title while opening the editor. Existing-item editor shortcuts and double-click focus the body. Alt/Option+Shift+N toggles Notes visibility. Settings include device-local spellcheck enablement and language preference (dictionary support depends on the browser/system).

### 10.6.0
Titles in the Outline and editor support `@` date scheduling: today, tomorrow/tom, weekdays, next weekday, DD/MM/YYYY, ISO dates, and day/month names. Enter or click confirms a suggestion; Escape dismisses it. Confirmed expressions are removed from the title and added to ordinary explicit scheduled dates, with duplicate prevention and undo/redo. Dates use local calendar time and the app's existing 2026–2150 calendar range.

### 10.6.2
Editor headers omit the redundant type label. A bare @ opens a date dialog after one second. Titles support [[ to choose a parent; reference pickers support arrow navigation and restore the editing caret on Escape. Internal rich-text paste preserves block formatting, list nesting and checklist state.

### 10.6.3
A bare @ immediately shows a compact caret-adjacent calendar with today selected. Arrow keys navigate days and weeks; Enter or clicking schedules the date. Typing an expression switches to suggestions. The delayed modal date picker has been removed.

### 10.7.0 — Basic editor tables
Insert tables from the formatting palette's 6×6 picker. Right-click a cell for row/column insertion or deletion, header toggling and table deletion. Tab/Shift+Tab moves between cells; Tab at the end adds a row. Enter moves down a column (adding a row at the end); Shift+Enter inserts a cell line break.
Tables use pipe Markdown, inline formatting, `<br>` for cell line breaks and character entities for literal Markdown punctuation. Standard pipe tables always have headers; the optional `<!-- table:no-header -->` comment preserves a disabled header in YuTaNoHe without changing JSON storage. Other Markdown viewers may still style that first row as a header. No new dependencies.

### 10.7.2
The title and body share a permanent, subtle themed writing-area border below the toolbar; properties remain outside. Scheduled-date grouping now has a dedicated Milestones section immediately before Targets. Milestones are excluded from Unscheduled and still appear under any explicit scheduled dates.

The Outline now uses a compact two-row header with Group by alongside Filters. Clear all is visible only with active filters and leaves grouping unchanged. Selected rows use background highlighting only; the current week highlights only its week-number cell.

### 10.8.0
Adds Sepia Paper, Midnight Blue and Amber Night alongside existing Light and Dark. Theme selection in Settings applies and persists immediately on the device, without changing JSON documents. Restores the borderless writing surface and retains the editable header title, Source menu, tables and all other editor features.

### 10.8.1
Custom-theme pane focus frames remain visible over headers and scrolling content. Past calendar days use subdued surfaces, and only the current week number receives a highlight. The Settings title stays visible while scrolling in every theme.

### 10.9.0 — Editor sidebar
The editor follows the supplied mockup: editable code/title header aligned with the borderless writing area, and a 240px right sidebar. Icon tabs show document headings, existing Properties controls, or the complete existing Details information/actions. Headings support H1–H6, navigation, current-section indication and branch collapse. Sidebar visibility and active tab are device-local preferences; narrow editor panes use an overlay. The header also has a Focus Mode toggle that hides the Outline and restores the previous pane split when exited. The separate Details button and bottom properties area are replaced by these sidebar tabs; Alt+D still opens Details. Existing JSON, recurrence, tables, Source, saving and history mechanisms are reused.

### 10.9.1 — Sidebar refinements

Properties is the initial sidebar tab, followed by Outline and Details. Ctrl+Alt+1/2 opens Properties/Outline; Ctrl+Alt+0 toggles the sidebar (Cmd+Option on macOS). Writing width remains stable when hiding the sidebar or entering Focus Mode. Heading indentation and Note property stacking are corrected; redundant child/done buttons are removed from the interface.

### 10.10.0 — Inline Todos

Rich Text supports `<wording>`, `d<wording>`, `w<wording>`, `h<wording>` and `c<wording>` for UUID-linked Todos with independent inline wording. Use the existing @ picker before closing the expression, or `[` to choose another parent. `!<` selects an existing Todo contextually, with an explicit global-search action. Modifier-click opens the Todo; its context menu offers status changes and unlinking. Occurrence-specific backlinks return to the exact phrase. Private clipboard data preserves links within the app while external clipboard text stays readable.

Each occurrence is stored in document Markdown as a sanitized `<span data-inline-todo="UUID" data-occurrence="UUID">wording</span>`; Todo data and JSON schema remain unchanged. Status and parent indicators are derived from the real item. Existing files remain compatible.

### 10.10.1 — Outline and linking workflow fixes

Shift+Arrow hierarchy moves update only the Outline. The editor fills the available workspace; the device-local Limit editor width setting optionally centers a maximum 900px document column. Alt/Option+Shift+T filters the Outline to today's entries and centers its calendar week without filtering Calendar entries. Global inline-Todo search starts with all Todos and a fresh query. The [[ / ![[ selectors can create a root Note or Todo; title [[ can create a new root parent and move the current item beneath it. Creation plus linking/reparenting is one undo operation.

### 10.10.2 — Desktop Quick Open

Ctrl+Alt+K (Windows), Cmd+Option+K (macOS) restores the existing desktop window and opens the shared item picker in navigation-only mode. Existing capture shortcuts are retained. Registration failures are nonfatal and reported through the existing shortcut status notification; successful registrations are not repeated, and shortcuts are released on exit. Registration is Rust-owned using the official Tauri v2 global-shortcut plugin, so no frontend global-shortcut command permissions are required or exposed.

### 10.10.3 — Native title-bar theme

The desktop bridge calls Tauri Window.setTheme using the existing appearance preference: Light/Sepia → light; Dark/Midnight/Amber → dark. It synchronizes at startup and immediately on theme changes, with ordered native calls. Native decorations and app palettes are unchanged. macOS follows Tauri's supported application-wide theme behavior. Browser use makes no native calls.

### 10.11.0 — Autosave and recovery

Autosave is enabled by default: 2 seconds idle, 15 seconds during continuous changes, and on item/Focus Mode navigation. Manual Save uses the same serialized queue. The existing local save-status indicator opens saving/recovery options, including disabling autosave, exporting unsaved content, explicitly reloading and browser recovery snapshots. A conflict stops writes until reload; permission errors require an explicit manual action. Desktop close attempts a flush before the existing discard confirmation.

Desktop writes retain SHA-256 checks and atomic temporary-file replacement. Every five minutes at most, a validated pre-save snapshot is kept in `<database>.json.backups`, with up to ten timestamped copies. Browser snapshots are stored separately in IndexedDB (up to ten across databases) and downloadable from recovery options; clearing browser storage removes them. No browser permission prompts or downloads are initiated by autosave. “Saved” confirms a local JSON write only, not OneDrive synchronization. OS/OneDrive writers cannot be locked across devices: fingerprints are checked immediately before replacement, but no local app can provide distributed locking for OneDrive.

### 10.11.3 — Compact menu and local font choices

Quick Open shows item codes and titles. The application menu uses compact, borderless actions and section dividers, without headings or Undo/Redo buttons. Keyboard undo/redo remains available.

Settings offers Bear Sans, Avenir and Avenir Next only when a named local font is available. Fonts are neither downloaded nor bundled. Existing font choices, theme preferences and database content are preserved. Validation: `tests/menu-fonts.cjs`, `tests/quick-open.cjs`, `tests/settings.cjs` and `tests/workflow-regressions.cjs`.

### 10.11.4 — Workspace refinements

The interface now uses one continuous workspace background without outer pane frames. Writing-area and editor-sidebar borders remain. The straight Outline selection accent appears only while the Outline has focus; its selection shading stays visible elsewhere. Header actions use borderless, softly shaded active states. Details uses compact, unboxed label/value rows. Calendar dates are muted, Today uses accented `4 Nov - Today` text, and selected days, current-week numbers and milestone labels have no background fill.

### 10.11.5 — Workspace refinements and narrow sidebar

The interface uses theme-accent checkboxes, quieter Properties fields, plain editor codes and Backlinks, slightly larger calendar dates and Outline metadata, and sentence-case Filters headings with fewer dividers. Target bars retain their status/duration fills without surrounding outlines; selection uses one accent stripe.

In narrow editor panes, returning to the document dismisses the sidebar drawer without changing the saved wide-pane visibility preference. Its button and existing shortcuts reopen it. Writing width, caret, undo and document data are preserved.

Validation: `tests/workspace-polish.cjs` passes in Chromium and WebKit across all five themes. Native Cargo check passes.

### 10.11.6 — Compact layout and smaller fonts

Interface and editor font sizes now support 8 px through their existing maximums. The interface removes inactive header fills and redundant Outline/calendar/editor dividers, aligns the Outline controls across the available header width, and uses the sidebar selection fill for selected items. Outer margins and pane gaps are reduced by 60%; writing-area padding and sidebar width behavior remain unchanged. Calendar items follow the interface font size on both platforms. Calendar grid directions share the same 1 px weight and muted color.

Validation: settings persistence at 8 px, five-theme density checks in Chromium and WebKit and the existing interface regression suite.

### 10.11.7 — Consistent item code sizes

Outline codes, Outline titles and Calendar codes now follow the same interface font-size preference on all platforms. Calendar items have no background fill, including selected items; the selected accent and existing code colors remain.

### 10.11.8 — Editor focus return

Alt/Option+2 returns to an already-open item without rebuilding its document. Paragraph normalization preserves selection endpoints when wrapping browser-created root text, preventing subsequent letters from becoming separate paragraphs. Existing Source selection and pane navigation are retained. Regression checks cover repeated shortcut round trips, empty text, checklists, tables and the root-text caret failure in Chromium and WebKit.

### 10.11.9 — Compact Outline toolbar

The interface uses one row with the existing application menu and Search, Filters and Group by icons. Search expands leftward; `/` focuses it outside text fields, and Escape clears/closes it. Filter chips and Clear all occupy a row only while filters are active. The original Filters panel and grouping select retain their handlers and semantics. Alt/Option+Shift+F toggles Filters; Alt/Option+Shift+G toggles grouping, with arrows to navigate, Enter to confirm and Escape to cancel. Toolbar labels/tooltips expose filter counts and the current group. Reduced-motion preferences disable Search animation.

Validation: toolbar checks in Chromium and WebKit cover all five themes, narrow panes, stationary controls, filtering/grouping, editor shortcuts, tooltips and reduced motion. No local desktop packaging; GitHub builds the desktop apps.

### 10.11.10 — Visible movement, inactive filtering and readability

Outline Shift+Arrow commands and the existing movement actions use visible siblings and hierarchy. Vertical moves exchange visible ordering slots, skipping hidden siblings. Indent/outdent reuse hierarchy validation and reference maintenance while retaining hidden siblings' parent/order values. Invalid boundary/grouped moves are no-ops. New items allocate the next available integer order after the current maximum so files with preserved ordering gaps remain valid.

Show inactive replaces Show done using the same control and shortcut: unchecked hides Done, Cancelled and On hold, while Todo, Waiting for and Notes remain eligible. Active descendants of hidden inactive ancestors remain accessible without changing parent relationships. Explicit status filters still apply after this independent visibility gate.

Group by renders theme-aware choices from the existing select options and commits through the same handler. Light/Sepia primary text is near-black; metadata and Note/Todo code colors are darker, without changing backgrounds. Completed items retain readable opacity. Tests cover visible movement, hidden records, hierarchy validation, undo/redo and JSON reopening, inactive statuses across grouping modes, all-theme menu behavior and light-theme text/code contrast.

### 10.11.11 — Permanent interface

The Outline toolbar, calendar grid and responsive editor sidebar are now the standard interface. Settings offers the five color themes. On upgrade the app discards the retired layout preference and keeps the user’s other appearance settings. Quick Open shows the code and title of every result.

### 10.11.12 — Calendar titles and pane navigation

Calendar entries show their code and title on one line, with the full title on hover. Targets spanning several years keep their lane across year boundaries. The Outline, Calendar, Targets and editor controls share a top alignment, and the editor sidebar uses a single vertical divider.

Ctrl+Shift+F (Cmd+Shift+F on macOS) focuses Outline Search throughout the app. Activating the right pane clears and collapses Search while keeping focus there. Calendar arrow keys step the selected day filter backward or forward and skip hidden weekends.

### 10.11.13 — Keyboard navigation and search

Escape returns from an editor search to its saved caret. Outline Search lists matches across the active database and restores the filtered Outline when cancelled. Escape during initial Outline creation cancels the draft. Up/Down in Calendar step one week and Left/Right step one visible day. Day filters appear in the chip row. Code text is 2 px smaller, with Dusty Rose and Muted Teal codes in Amber Night. Dark palettes use themed dropdowns. GitHub Actions publishes desktop installers only.

The current editor, flat Pinned shortcuts, text sizing, installed-font picker and navigation changes are documented in [Editor usability verification](docs/development/EDITOR-USABILITY-VERIFICATION.md), including test coverage and native-input limitations.
