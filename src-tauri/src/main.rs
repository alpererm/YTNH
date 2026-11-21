#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod files;
mod fonts;
mod close_probe;
mod planner_calendar;
#[cfg(feature="inline-images-preview")]
mod image_import;
#[cfg(feature="inline-images-preview")]
mod image_preview;
mod libraries;
use files::{Files, Handle};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

type FileState = Mutex<Files>;
#[tauri::command]
async fn pick_json(
    app: tauri::AppHandle,
    state: State<'_, FileState>,
    name: String,
) -> Result<Option<Handle>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let picker = app
            .dialog()
            .file()
            .add_filter("Notes and Todos JSON", &["json"]);
        picker.set_title("Save JSON recovery copy").set_file_name(&name).blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    match picked {
        None => Ok(None),
        Some(file) => {
            let mut path = file.into_path().map_err(|e| e.to_string())?;
            if path.extension().is_none() {
                path.set_extension("json");
            }
            state
                .lock()
                .map_err(|e| e.to_string())?
                .grant(path)
                .map(Some)
        }
    }
}
#[tauri::command]
fn write_json(
    state: State<'_, FileState>,
    id: String,
    text: String,
    expected: Option<String>,
) -> Result<String, String> {
    let files = state.lock().map_err(|e| e.to_string())?;
    files::rolling_backup(files.path(&id)?, expected.as_deref())?;
    files::atomic_json_write(files.path(&id)?, &text, expected.as_deref())
}
#[tauri::command]
fn open_link(app: tauri::AppHandle, href: String) -> Result<(), String> {
    let url = url::Url::parse(&href).map_err(|e| e.to_string())?;
    match url.scheme() {
        "file" => {
            let path = url
                .to_file_path()
                .map_err(|_| "This file path is not valid on this operating system.")?;
            if !path.exists() {
                return Err("The linked file was not found on this computer.".into());
            }
            app.opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(|e| e.to_string())
        }
        "https" | "http" | "mailto" => app
            .opener()
            .open_url(href, None::<&str>)
            .map_err(|e| e.to_string()),
        _ => Err("This link type is not supported.".into()),
    }
}
#[tauri::command]
async fn confirm_close(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message("You have unsaved changes. Close without saving?")
            .title("Unsaved changes")
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())
}
// Keep the attempt until save/close completes or is cancelled.
#[derive(Default)]
struct CloseProbe(Mutex<close_probe::CloseAttempt>);
#[tauri::command]
fn acknowledge_close(probe: State<'_, CloseProbe>) { probe.0.lock().unwrap().acknowledge(); }
#[tauri::command]
fn finish_close_attempt(probe: State<'_, CloseProbe>) { probe.0.lock().unwrap().finish(); }

fn request_window_close(window: tauri::WebviewWindow) {
    if cfg!(windows) {
        let offer_force = window.state::<CloseProbe>().0.lock().unwrap().request(std::time::Instant::now());
        if offer_force {
            let app = window.app_handle().clone();
            app.dialog().message("The previous close request has not finished. Saving may still be in progress. Force close? Unsaved changes may be lost; do this only if the app is stuck.")
                .title("Close still pending").buttons(MessageDialogButtons::OkCancel)
                .show(move |confirmed| {
                    window.state::<CloseProbe>().0.lock().unwrap().dismiss_prompt(std::time::Instant::now());
                    if confirmed { let _ = window.destroy(); }
                });
            return;
        }
    }
    let _ = window.eval("window.dispatchEvent(new Event('notes-desktop-close'))");
}
#[tauri::command]
fn close_app(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|e| e.to_string())
}
#[tauri::command]
fn set_zoom(window: tauri::WebviewWindow, factor: f64) -> Result<(), String> {
    if !factor.is_finite() || !(0.5..=2.5).contains(&factor) { return Err("Invalid zoom".into()); }
    window.set_zoom(factor).map_err(|e| e.to_string())
}
#[derive(Default, Clone, serde::Serialize)]
struct CaptureStatus { registered: Vec<String>, errors: Vec<String> }
#[tauri::command]
fn capture_status(state: State<'_, Mutex<CaptureStatus>>) -> CaptureStatus {
    state.lock().unwrap().clone()
}
fn register_capture_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
    let state = app.state::<Mutex<CaptureStatus>>();
    let mut status = state.lock().unwrap();
    status.errors.clear();
    let quick_key = if cfg!(target_os = "macos") { "Cmd+Option+K" } else { "Ctrl+Alt+K" };
    for (code, key, kind) in [(Code::KeyT, "Ctrl+Alt+T", "Todo"), (Code::KeyN, "Ctrl+Alt+N", "Note"), (Code::KeyK, quick_key, "QuickOpen")] {
        if status.registered.iter().any(|s| s == key) { continue; }
        let primary = if kind == "QuickOpen" && cfg!(target_os = "macos") { Modifiers::SUPER } else { Modifiers::CONTROL };
        let shortcut = Shortcut::new(Some(primary | Modifiers::ALT), code);
        match app.global_shortcut().on_shortcut(shortcut, move |app, _, event| {
            if event.state != ShortcutState::Pressed { return; }
            // Windows delivers WM_HOTKEY inside a native window procedure. Queue
            // webview/window work after that callback returns rather than reentering it.
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(window) = handle.get_webview_window("main") {
                    if window.is_minimized().unwrap_or(false) { let _ = window.unminimize(); }
                    if !window.is_visible().unwrap_or(true) { let _ = window.show(); }
                    if !window.is_focused().unwrap_or(false) { let _ = window.set_focus(); }
                    let script = format!("window.dispatchEvent(new CustomEvent('notes-capture',{{detail:'{}'}}))", kind);
                    if let Err(error) = window.eval(&script) {
                        handle.state::<Mutex<CaptureStatus>>().lock().unwrap().errors.push(format!("Capture delivery failed: {error}"));
                    }
                }
            });
        }) {
            Ok(()) => status.registered.push(key.into()),
            Err(error) => status.errors.push(format!("{key}: {error}. Close other copies of this app or apps using this shortcut, then return here to retry.")),
        }
    }
}
fn main() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(Files::default()))
        .manage(CloseProbe::default())
        .manage(libraries::LibraryRuntime::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Mutex::new(CaptureStatus::default()))
        .setup(|app| {
            register_capture_shortcuts(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            libraries::library_action,
            fonts::installed_font_families,
            pick_json,
            planner_calendar::read_planner_calendar,
            write_json,
            open_link,
            confirm_close,
            close_app,
            acknowledge_close,
            finish_close_attempt,
            set_zoom,
            capture_status
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                register_capture_shortcuts(window.app_handle());
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(webview) = window.get_webview_window("main") {
                    request_window_close(webview);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Unable to start Local Notes and Todos");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let _ = app.global_shortcut().unregister_all();
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if let Some(window) = app.get_webview_window("main") {
                api.prevent_exit();
                request_window_close(window);
            }
        }
    });
}
