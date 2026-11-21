use serde_json::{json, Value};
use std::{fs, io::Read, path::PathBuf, time::UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn read_planner_calendar(
    app: tauri::AppHandle,
    library: String,
    reuse: bool,
    source: String,
) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || read(app, library, reuse, source))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn read(
    app: tauri::AppHandle,
    library: String,
    reuse: bool,
    source: String,
) -> Result<Option<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let folder = app.path().app_config_dir()?.join("planner-calendars");
    uuid::Uuid::parse_str(&source)?;
    let key = yutanohe_library::digest(format!("{library}/{source}").as_bytes());
    let grant = folder.join(key);
    let previous = match fs::read(&grant) {
        Ok(bytes) => Some(serde_json::from_slice::<PathBuf>(&bytes)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    let path = if let Some(path) = previous.as_ref().filter(|p| reuse && p.is_file()) {
        path.clone()
    } else {
        let mut dialog = app.dialog().file().add_filter("Outlook Calendar", &["ics"]);
        if let Some(parent) = previous.as_ref().and_then(|p| p.parent()) {
            dialog = dialog.set_directory(parent);
        }
        let Some(p) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        p.into_path()?
    };
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("ics"))
    {
        return Err("Choose an .ics calendar export".into());
    }
    let f = fs::File::open(&path)?;
    let modified = f
        .metadata()?
        .modified()?
        .duration_since(UNIX_EPOCH)?
        .as_millis() as u64;
    let mut bytes = Vec::new();
    const LIMIT: u64 = 64 * 1024 * 1024;
    f.take(LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > LIMIT {
        return Err("Choose a smaller Outlook export (64 MiB maximum)".into());
    }
    let text = String::from_utf8(bytes)?;
    fs::create_dir_all(&folder)?;
    let prior = crate::files::read_bytes(&grant)?;
    crate::files::atomic_json_write(
        &grant,
        &serde_json::to_string(&path)?,
        prior.as_ref().map(|b| crate::files::revision(b)).as_deref(),
    )?;
    Ok(Some(
        json!({"name":path.file_name().and_then(|p|p.to_str()),"modified":modified,"text":text}),
    ))
}
