use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub struct Files {
    pub grants: HashMap<String, PathBuf>,
}
#[derive(Serialize)]
pub struct Handle {
    pub id: String,
    pub name: String,
    pub revision: Option<String>,
}
pub fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::metadata(path) {
        Ok(meta) => {
            if !meta.is_file() || meta.len() > 128 * 1024 * 1024 {
                return Err("Choose a JSON file smaller than 128 MB.".into());
            }
            fs::read(path).map(Some).map_err(|e| e.to_string())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
impl Files {
    pub fn grant(&mut self, path: PathBuf) -> Result<Handle, String> {
        if !path.is_absolute()
            || !path
                .extension()
                .is_some_and(|s| s.eq_ignore_ascii_case("json"))
        {
            return Err("Choose a file with the .json extension.".into());
        }
        // Resolve existing symlinks so a save replaces the actual chosen file.
        let path = if path.exists() {
            path.canonicalize().map_err(|e| e.to_string())?
        } else {
            path.parent()
                .ok_or("Missing parent directory")?
                .canonicalize()
                .map_err(|e| e.to_string())?
                .join(path.file_name().ok_or("Missing filename")?)
        };
        let revision = read_bytes(&path)?.map(|b| revision(&b));
        let name = path
            .file_name()
            .ok_or("Missing filename")?
            .to_string_lossy()
            .into_owned();
        let id = uuid::Uuid::new_v4().to_string();
        self.grants.insert(id.clone(), path);
        Ok(Handle { id, name, revision })
    }
    pub fn path(&self, id: &str) -> Result<&Path, String> {
        self.grants
            .get(id)
            .map(PathBuf::as_path)
            .ok_or_else(|| "Choose the file through Open or Save first.".into())
    }
}

pub fn atomic_json_write(
    path: &Path,
    text: &str,
    expected: Option<&str>,
) -> Result<String, String> {
    serde_json::from_str::<serde_json::Value>(text)
        .map_err(|e| format!("Invalid JSON; file was not changed: {e}"))?;
    let matches = || -> Result<bool, String> {
        Ok(read_bytes(path)?.map(|b| revision(&b)).as_deref() == expected)
    };
    if !matches()? {
        return Err(
            "The file changed outside this app. Reopen it before saving; no data was overwritten."
                .into(),
        );
    }
    let parent = path.parent().ok_or("Missing parent directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(meta) = fs::metadata(path) {
        temp.as_file()
            .set_permissions(meta.permissions())
            .map_err(|e| e.to_string())?;
    }
    temp.write_all(text.as_bytes())
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    // Check again after preparing the replacement; never truncate the live JSON.
    if !matches()? {
        return Err("The file changed while preparing the save. Reopen it before saving.".into());
    }
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(revision(text.as_bytes()))
}

// Periodic, validated pre-save copies; rotation never touches the active database.
pub fn rolling_backup(path: &Path, expected: Option<&str>) -> Result<(), String> {
    let Some(bytes) = read_bytes(path)? else { return Ok(()) };
    if Some(revision(&bytes).as_str()) != expected { return Err("The file changed outside this app.".into()); }
    serde_json::from_slice::<serde_json::Value>(&bytes).map_err(|e| e.to_string())?;
    let dir = path.with_file_name(format!("{}.backups", path.file_name().ok_or("Missing filename")?.to_string_lossy()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut copies: Vec<PathBuf> = fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(Result::ok).map(|e| e.path()).filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("backup-")) && p.extension().is_some_and(|e| e == "json")).collect();
    copies.sort();
    if copies.last().and_then(|p| fs::metadata(p).ok()).and_then(|m| m.modified().ok()).and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() < 300) { return Ok(()) }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let backup = dir.join(format!("backup-{stamp:013}.json"));
    let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    atomic_json_write(&backup, &text, None)?;
    copies.push(backup);
    let remove = copies.len().saturating_sub(10);
    for old in copies.into_iter().take(remove) { fs::remove_file(old).map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotates_backups_without_touching_active_file() {
        let dir = tempfile::tempdir().unwrap();let path=dir.path().join("notes.json");fs::write(&path,"{}").unwrap();
        let backups=dir.path().join("notes.json.backups");fs::create_dir(&backups).unwrap();
        for n in 0..11 {
            let p = backups.join(format!("backup-{n:013}.json"));
            fs::write(&p, "{}").unwrap();
            // Windows SetFileTime requires FILE_WRITE_ATTRIBUTES; File::open is read-only.
            // Do not truncate the fixture when acquiring a writable handle.
            let file = fs::OpenOptions::new().write(true).open(&p).unwrap();
            file.set_times(fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
                .expect("Age the backup fixture using a writable handle");
        }
        rolling_backup(&path,Some(&revision(b"{}"))).unwrap();
        assert_eq!(fs::read_dir(&backups).unwrap().count(),10);assert_eq!(fs::read_to_string(&path).unwrap(),"{}");
        assert!(rolling_backup(&path,Some("wrong")).is_err());
    }
    #[test]
    fn writes_exact_json_without_migration() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("notes.json");
        let text = "{\n  \"schemaVersion\": 10, \"unknown\": [1,2,3]\n}";
        let v = atomic_json_write(&p, text, None).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), text);
        atomic_json_write(&p, "{\"next\":true}", Some(&v)).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"next\":true}");
    }
    #[test]
    fn refuses_external_change_and_bad_json() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("notes.json");
        fs::write(&p, "{}").unwrap();
        let old = revision(b"{}");
        fs::write(&p, "{\"external\":true}").unwrap();
        assert!(atomic_json_write(&p, "{}", Some(&old)).is_err());
        assert!(atomic_json_write(&p, "not JSON", None).is_err());
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"external\":true}");
    }
    #[test]
    fn refuses_unknown_handles_and_non_json() {
        let mut files = Files::default();
        assert!(files.path("made-up").is_err());
        let dir = tempfile::tempdir().unwrap();
        assert!(files.grant(dir.path().join("other.txt")).is_err());
        let h = files.grant(dir.path().join("new.json")).unwrap();
        assert!(h.revision.is_none());
        assert!(files.path(&h.id).is_ok());
    }
    #[test]
    fn refuses_save_as_overwrite_after_picker() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("new.json");
        fs::write(&p, "{\"createdElsewhere\":true}").unwrap();
        assert!(atomic_json_write(&p, "{}", None).is_err());
    }
}
