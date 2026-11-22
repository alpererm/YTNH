// Native macOS menu bar. Items carry their usual shortcut; choosing one sends its id to the page, which runs
// the same code as the keyboard shortcut or ☰ menu entry. The page sees key presses first, so shortcuts it
// already handles behave exactly as before. Edit keeps the standard system items (undo, clipboard).
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Runtime};

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accelerator: Option<&str>) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let mut b = MenuItemBuilder::with_id(id, label);
    if let Some(a) = accelerator {
        b = b.accelerator(a);
    }
    b.build(app)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "YTNH")
        .item(&item(app, "click:aboutBtn", "About YTNH", None)?)
        .separator()
        .item(&item(app, "fn:settings", "Settings…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "key:Mod+N", "New Note", Some("CmdOrCtrl+N"))?)
        .item(&item(app, "key:Mod+T", "New Todo", Some("CmdOrCtrl+T"))?)
        .separator()
        .item(&item(app, "click:newFile", "New Library…", None)?)
        .item(&item(app, "click:openFile", "Open Library…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item(app, "click:saveFile", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "key:Mod+Shift+S", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .item(&item(app, "click:exportFile", "Back Up Library…", None)?)
        .separator()
        .item(&item(app, "click:importMarkdownFolder", "Import Markdown Folder…", None)?)
        .item(&item(app, "text:Import Outlook Calendar…", "Import Outlook Calendar…", None)?)
        .item(&item(app, "text:Reimport Outlook Calendar…", "Reimport Outlook Calendar…", None)?)
        .separator()
        .item(&item(app, "click:archiveBrowser", "Archive…", None)?)
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&item(app, "key:Mod+F", "Find in Document", Some("CmdOrCtrl+F"))?)
        .item(&item(app, "key:Mod+Alt+F", "Find and Replace", Some("CmdOrCtrl+Alt+F"))?)
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "key:Mod+1", "Outline", Some("CmdOrCtrl+1"))?)
        .item(&item(app, "key:Mod+2", "Editor", Some("CmdOrCtrl+2"))?)
        .item(&item(app, "key:Mod+3", "Calendar", Some("CmdOrCtrl+3"))?)
        .item(&item(app, "key:Mod+4", "Targets", Some("CmdOrCtrl+4"))?)
        .separator()
        .item(&item(app, "key:Mod+Shift+D", "Daily Planner", Some("CmdOrCtrl+Shift+D"))?)
        .item(&item(app, "key:Mod+Backslash", "Side Panel", Some("CmdOrCtrl+\\"))?)
        .item(&item(app, "key:Ctrl+Mod+F", "Focus Mode", Some("Ctrl+CmdOrCtrl+F"))?)
        .separator()
        .item(&item(app, "key:Mod+Equal", "Zoom In", Some("CmdOrCtrl+="))?)
        .item(&item(app, "key:Mod+Minus", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .item(&item(app, "key:Mod+Digit0", "Actual Size", Some("CmdOrCtrl+0"))?)
        .build()?;
    let go = SubmenuBuilder::new(app, "Go")
        .item(&item(app, "fn:quickOpen", "Quick Open…", None)?)
        .item(&item(app, "key:Mod+Shift+F", "Search the Outline", Some("CmdOrCtrl+Shift+F"))?)
        .item(&item(app, "key:Mod+Alt+D", "Jump to Date…", Some("CmdOrCtrl+Alt+D"))?)
        .item(&item(app, "key:Alt+Shift+T", "Today", None)?)
        .separator()
        .item(&item(app, "key:Mod+BracketLeft", "Back", Some("CmdOrCtrl+["))?)
        .item(&item(app, "key:Mod+BracketRight", "Forward", Some("CmdOrCtrl+]"))?)
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;
    let help = SubmenuBuilder::new(app, "Help")
        .item(&item(app, "fn:help", "YTNH Help", None)?)
        .item(&item(app, "fn:tour", "Open the Tour…", None)?)
        .build()?;
    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &view, &go, &window, &help]).build()
}

/// Sends a chosen menu item to the page.
pub fn deliver<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let detail = serde_json::to_string(id).unwrap_or_else(|_| "\"\"".into());
        let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('ytnh-menu',{{detail:{detail}}}))"));
    }
}
