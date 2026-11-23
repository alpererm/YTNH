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
    // Reimport follows the newest .ics export in the remembered folder, so a fresh
    // Outlook export saved as "Calendar(1).ics" is picked up without a file dialog.
    let latest = previous
        .as_ref()
        .filter(|_| reuse)
        .and_then(|p| p.parent())
        .and_then(newest_ics);
    let path = if let Some(path) = latest.or_else(|| previous.clone().filter(|p| reuse && p.is_file())) {
        path
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

/// The most recently modified `.ics` file directly inside `folder`, if any.
fn newest_ics(folder: &std::path::Path) -> Option<PathBuf> {
    fs::read_dir(folder)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("ics"))
        })
        .filter_map(|p| Some((fs::metadata(&p).ok()?.modified().ok()?, p)))
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, p)| p)
}

#[cfg(test)]
mod tests {
    use super::newest_ics;
    use std::{fs, thread, time::Duration};

    #[test]
    fn reimport_prefers_the_newest_export_in_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Calendar.ics"), "old").unwrap();
        fs::write(dir.path().join("notes.txt"), "ignored").unwrap();
        thread::sleep(Duration::from_millis(20));
        fs::write(dir.path().join("Calendar(1).ics"), "new").unwrap();
        assert_eq!(newest_ics(dir.path()).unwrap().file_name().unwrap(), "Calendar(1).ics");
        assert!(newest_ics(&dir.path().join("missing")).is_none());
    }
}
