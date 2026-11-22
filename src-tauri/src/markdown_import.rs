// Markdown folder import: the user picks a folder; every Markdown file in it and its subfolders is read
// (hidden files and folders such as .obsidian or .git are skipped, links are not followed). Images are
// read later, one at a time, only from inside the chosen folder.
use base64::Engine;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

const MAX_FILES: usize = 5000;
const MAX_MARKDOWN_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 100 * 1024 * 1024;
const MARKDOWN: [&str; 3] = ["md", "markdown", "mdown"];
const IMAGES: [&str; 9] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif", "bmp"];

#[derive(Default)]
pub struct ImportRoot(Mutex<Option<(String, PathBuf)>>);

fn extension(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn iso(time: std::io::Result<SystemTime>) -> Option<String> {
    let secs = time.ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
    Some(format_unix(secs))
}

// Civil-from-days (Howard Hinnant), UTC, so no date crate is needed.
fn format_unix(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    if m <= 2 {
        y += 1;
    }
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<&str> = rel.components().map(|c| c.as_os_str().to_str()).collect::<Option<_>>()?;
    Some(parts.join("/"))
}

fn walk(root: &Path, dir: &Path, files: &mut Vec<Value>, images: &mut Vec<String>, skipped: &mut usize) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { *skipped += 1; continue };
        if name.starts_with('.') {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            walk(root, &path, files, images, skipped)?;
            continue;
        }
        let ext = extension(&path);
        let Some(rel) = relative(root, &path) else { continue };
        if IMAGES.contains(&ext.as_str()) {
            images.push(rel);
            continue;
        }
        if !MARKDOWN.contains(&ext.as_str()) {
            continue;
        }
        if files.len() >= MAX_FILES {
            return Err(format!("The folder has more than {MAX_FILES} Markdown files. Choose a smaller folder."));
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.len() > MAX_MARKDOWN_BYTES {
            *skipped += 1;
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes)).into_owned();
        files.push(json!({"path": rel, "text": text, "created": iso(meta.created()), "modified": iso(meta.modified())}));
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_markdown_folder(app: tauri::AppHandle, state: State<'_, ImportRoot>) -> Result<Option<Value>, String> {
    let Some(folder) = app.dialog().file().set_title("Choose a folder of Markdown files").blocking_pick_folder() else {
        return Ok(None);
    };
    let root = folder.into_path().map_err(|e| e.to_string())?.canonicalize().map_err(|e| e.to_string())?;
    let scan = root.clone();
    let (files, images, skipped) = tauri::async_runtime::spawn_blocking(move || {
        let (mut files, mut images, mut skipped) = (Vec::new(), Vec::new(), 0usize);
        walk(&scan, &scan, &mut files, &mut images, &mut skipped).map(|_| (files, images, skipped))
    })
    .await
    .map_err(|e| e.to_string())??;
    let token = uuid::Uuid::new_v4().to_string();
    let name = root.file_name().and_then(|n| n.to_str()).unwrap_or("Markdown").to_owned();
    *state.0.lock().map_err(|_| "Import unavailable")? = Some((token.clone(), root));
    Ok(Some(json!({"token": token, "name": name, "files": files, "images": images, "skipped": skipped})))
}

/// Reads one image from the folder chosen in `pick_markdown_folder`, as base64. Paths are relative,
/// may not leave that folder, and must name an image file.
#[tauri::command]
pub async fn read_markdown_import_image(state: State<'_, ImportRoot>, token: String, path: String) -> Result<Option<String>, String> {
    let root = match &*state.0.lock().map_err(|_| "Import unavailable")? {
        Some((t, root)) if *t == token => root.clone(),
        _ => return Err("This import has ended. Start it again.".into()),
    };
    let rel = Path::new(&path);
    if rel.is_absolute() || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Ok(None);
    }
    if !IMAGES.contains(&extension(rel).as_str()) {
        return Ok(None);
    }
    let Ok(full) = root.join(rel).canonicalize() else { return Ok(None) };
    if !full.starts_with(&root) || !full.is_file() {
        return Ok(None);
    }
    if fs::metadata(&full).map_err(|e| e.to_string())?.len() > MAX_IMAGE_BYTES {
        return Ok(None);
    }
    let bytes = fs::read(&full).map_err(|e| e.to_string())?;
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn end_markdown_import(state: State<'_, ImportRoot>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_unix_times_as_utc_iso() {
        assert_eq!(format_unix(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(format_unix(1_795_337_000), "2026-11-22T08:43:20.000Z");
        assert_eq!(format_unix(951_782_400), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn walks_markdown_and_images_skipping_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::create_dir_all(root.join("sub/deeper")).unwrap();
        fs::create_dir_all(root.join(".obsidian")).unwrap();
        fs::write(root.join("a.md"), "\u{FEFF}# A").unwrap();
        fs::write(root.join("sub/b.markdown"), "B").unwrap();
        fs::write(root.join("sub/deeper/c.md"), "C").unwrap();
        fs::write(root.join("sub/pic.PNG"), [1, 2, 3]).unwrap();
        fs::write(root.join(".obsidian/x.md"), "hidden").unwrap();
        fs::write(root.join("notes.txt"), "ignored").unwrap();
        let (mut files, mut images, mut skipped) = (Vec::new(), Vec::new(), 0);
        walk(&root, &root, &mut files, &mut images, &mut skipped).unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f["path"].as_str().unwrap()).collect();
        assert_eq!(paths, ["a.md", "sub/b.markdown", "sub/deeper/c.md"]);
        assert_eq!(files[0]["text"], "# A", "byte order mark removed");
        assert_eq!(images, ["sub/pic.PNG"]);
        assert_eq!(skipped, 0);
    }
}
