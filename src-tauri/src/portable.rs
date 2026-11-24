//! Portable mode: when a folder named `YTNH-data` sits next to the executable, YTNH keeps all of
//! its own data there (working copies, backups, Calendar grants and the WebView's settings
//! storage) instead of in the user profile, so the app can run from any folder or USB stick.
use std::path::PathBuf;
use tauri::{Manager, Runtime};

pub const FOLDER: &str = "YTNH-data";

/// The portable data folder, when the app is running in portable mode.
pub fn data_root() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.join(FOLDER);
    dir.is_dir().then_some(dir)
}

/// Must run before any window is created: WebView2 reads this when it starts.
pub fn prepare() {
    if let Some(root) = data_root() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root.join("webview"));
    }
}

pub fn local_data_dir<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<PathBuf> {
    match data_root() {
        Some(root) => Ok(root.join("local")),
        None => app.path().app_local_data_dir(),
    }
}

pub fn config_dir<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<PathBuf> {
    match data_root() {
        Some(root) => Ok(root.join("config")),
        None => app.path().app_config_dir(),
    }
}
