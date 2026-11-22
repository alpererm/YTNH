//! Desktop-only paths, file grants, device identity and the active-copy pointer.
use crate::files;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;
use yutanohe_library::{digest, lifecycle, portable, transfer, Repository, Result};

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    name: String,
    copy: PathBuf,
    exchange: PathBuf,
    source: Option<PathBuf>,
    source_hash: Option<String>,
    published: Option<String>,
    paused: bool,
    #[serde(default)]
    portable: bool,
}
#[derive(Serialize, Deserialize)]
struct Catalog {
    device: String,
    last: Option<String>,
    libraries: BTreeMap<String, Entry>,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            device: Uuid::new_v4().to_string(),
            last: None,
            libraries: BTreeMap::new(),
        }
    }
}
struct Store {
    root: PathBuf,
    cat: Catalog,
    catalog_issue: Option<String>,
    _lock: fs::File,
    portable: portable::WorkingStore,
}

fn arg<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    v[k].as_str().ok_or_else(|| format!("Missing {k}").into())
}
impl Store {
    fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("writer.lock"))?;
        lock.try_lock_exclusive().map_err(|_| {
            "Another copy of YTNH is already running. Close it and try again."
        })?;
        let path = root.join("catalog.json");
        let (cat, catalog_issue) = match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(cat) => (cat, None),
                Err(error) => (Catalog::default(), Some(format!("The local library list is damaged ({error}). Use Recover local portable library to select a verified copy. The damaged list will be retained; other portable copies remain available in recovery. Any legacy-library entries remain in that preserved list and may require manual recovery."))),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Catalog::default(), None),
            Err(e) => return Err(e.into()),
        };
        let portable = portable::WorkingStore::open(&root.join("portable-v1"), portable::Limits::default())?;
        Ok(Self {
            portable,
            root,
            cat,
            catalog_issue,
            _lock: lock,
        })
    }
    fn persist(&mut self) -> Result<()> {
        if let Some(issue) = &self.catalog_issue { return Err(issue.clone().into()); }
        let path = self.root.join("catalog.json");
        let result = (|| -> Result<()> {
            let prior = files::read_bytes(&path)?;
            let expected = prior.as_ref().map(|b| files::revision(b));
            files::atomic_json_write(
                &path,
                &serde_json::to_string_pretty(&self.cat)?,
                expected.as_deref(),
            )?;
            Ok(())
        })();
        if result.is_err() {
            if let Ok(bytes) = fs::read(path) {
                self.cat = serde_json::from_slice(&bytes)?
            } else {
                self.cat = Catalog::default()
            }
        }
        result
    }
    fn vault(&self, id: &str) -> PathBuf {
        if let Some(e) = self.cat.libraries.get(id).filter(|e| e.portable) { return e.copy.join("objects") }
        self.root.join("objects").join(id)
    }
    fn backups(&self, id: &str) -> PathBuf {
        self.root.join(if self.cat.libraries.get(id).is_some_and(|e| e.portable) { "portable-backups" } else { "backups" }).join(id)
    }
    fn attach_portable(&mut self, copy: portable::WorkingCopy) -> Result<Value> {
        let id = copy.session.library.clone();
        if let Some(old) = self.cat.libraries.get(&id).filter(|e| !e.portable) {
            transfer::immutable(&self.root.join("legacy-entries").join(format!("{}-{}.json", id, Uuid::new_v4())), &serde_json::to_vec(old)?)?;
        }
        let name = copy.session.master.file_name().unwrap_or_default().to_string_lossy().into_owned();
        self.add(&id, Entry { name, copy: copy.directory, exchange: PathBuf::new(), source: None, source_hash: None, published: Some(copy.session.base_revision), paused: false, portable: true })
    }
    fn check_catalog_action(&self, op: &str) -> Result<()> {
        if let Some(issue) = &self.catalog_issue {
            if !matches!(op, "portable_recovery_list" | "portable_adopt" | "list") {
                return Err(issue.clone().into());
            }
        }
        Ok(())
    }
    fn adopt_portable(&mut self, copy_id: &str) -> Result<Value> {
        if self.catalog_issue.is_some() {
            let raw=fs::read(self.root.join("catalog.json"))?;
            if serde_json::from_slice::<Catalog>(&raw).is_ok() {
                return Err("The library list changed. Restart and review it before recovery.".into());
            }
            let evidence=self.root.join("catalog-recovery");
            transfer::immutable(&evidence.join(format!("{}.json",Uuid::new_v4())),&raw)?;
            #[cfg(unix)]
            { fs::File::open(&evidence)?.sync_all()?; fs::File::open(&self.root)?.sync_all()?; }
        }
        let copy=self.portable.adopt_recovery(copy_id)?;
        let issue=self.catalog_issue.take();
        let result=self.attach_portable(copy);
        if result.is_err() { self.catalog_issue=issue; }
        result
    }
    fn open_master(&mut self, path: &Path) -> Result<Value> {
        // Do not let a stale master silently replace a known legacy library either.
        let stage = tempfile::tempdir_in(&self.root)?;
        let verified = portable::verify(path, stage.path(), portable::Limits::default())?;
        let incoming = Repository::open(&verified.database())?;
        let id = incoming.identity()?.0;
        if self.cat.libraries.get(&id).is_some_and(|e| !e.portable) && !incoming.descends_from(&self.repo(&id)?)? {
            return Err("The portable file is older than or divergent from the existing local library. Convert the current library instead.".into());
        }
        drop(incoming); drop(verified);
        let copy = self.portable.load(path)?;
        self.attach_portable(copy)
    }
    fn portable_publish(&mut self, id: &str, revision: &str, destination: Option<&Path>) -> Result<Value> {
        if !self.entry(id)?.portable { return Err("This is not a portable library".into()) }
        let copy = self.portable.publish(id, revision, destination)?;
        self.attach_portable(copy)
    }
    fn review_legacy(&self, id: &str) -> Result<Value> {
        if self.entry(id)?.portable { return Err("This library already has a library file".into()) }
        let stage = tempfile::tempdir_in(&self.root)?;
        let repo = self.repo(id)?;
        // A disposable, fully verified package proves required local assets are present.
        portable::create(&repo, &self.vault(id), &stage.path().join("review.ytnh"), stage.path(), portable::Limits::default())?;
        self.status(id)
    }
    fn transition_legacy(&mut self, id: &str, revision: &str, destination: &Path) -> Result<Value> {
        if self.entry(id)?.portable { return Err("This library already has a library file".into()) }
        if self.repo(id)?.identity()?.1.as_deref() != Some(revision) {
            return Err("The local library changed after review. Review it again before converting.".into());
        }
        self.convert_portable(id, destination)
    }
    fn convert_portable(&mut self, id: &str, destination: &Path) -> Result<Value> {
        let repo = self.repo(id)?;
        portable::create(&repo, &self.vault(id), destination, &self.root, portable::Limits::default())?;
        self.open_master(destination)
    }
    fn new_portable(&mut self, model: &Value, destination: &Path) -> Result<Value> {
        let stage = tempfile::tempdir_in(&self.root)?;
        let mut repo = Repository::create(&stage.path().join("library.sqlite"), &Uuid::new_v4().to_string(), None)?;
        repo.save(model, None, &self.cat.device)?;
        portable::create(&repo, &stage.path().join("objects"), destination, stage.path(), portable::Limits::default())?;
        self.open_master(destination)
    }
    fn entry(&self, id: &str) -> Result<Entry> {
        self.cat
            .libraries
            .get(id)
            .cloned()
            .ok_or_else(|| "Unknown local library".into())
    }
    fn repo(&self, id: &str) -> Result<Repository> {
        let r = Repository::open(&self.entry(id)?.copy.join("library.sqlite"))?;
        if r.identity()?.0 != id {
            return Err("Unexpected local library identity".into());
        }
        Ok(r)
    }
    fn status(&self, id: &str) -> Result<Value> {
        let e = self.entry(id)?;
        let head = self.repo(id)?.identity()?.1;
        if e.portable {
            let session = self.portable.session(id)?.ok_or("Missing portable session")?;
            return Ok(json!({"id":id,"name":e.name,"revision":head,"published":session.base_revision,"paused":false,"portable":true,"master":session.master,"unpublished":head.as_deref()!=Some(&session.base_revision)}));
        }
        Ok(
            json!({"id":id,"name":e.name,"revision":head,"published":e.published,"paused":e.paused,"unpublished":head!=e.published}),
        )
    }
    fn add(&mut self, id: &str, e: Entry) -> Result<Value> {
        self.cat.libraries.insert(id.to_owned(), e);
        self.cat.last = Some(id.into());
        self.persist()?;
        self.status(id)
    }
    #[cfg(test)]
    fn seed_legacy(&mut self, path: &Path) -> Result<Value> {
        let model: Value=serde_json::from_slice(&fs::read(path)?)?;
        let id=Uuid::new_v4().to_string();
        let copy=self.root.join(Uuid::new_v4().to_string()); fs::create_dir(&copy)?;
        let inv=transfer::stage_archives(&model,path.parent().ok_or("Missing fixture directory")?,&self.vault(&id),&Default::default())?;
        let mut repo=Repository::create(&copy.join("library.sqlite"),&id,None)?;
        repo.save_with_files(&model,None,&self.cat.device,&inv)?;
        let exchange=path.with_extension("handoffs");fs::create_dir_all(&exchange)?;
        transfer::immutable(&exchange.join("library.identity.json"),&serde_json::to_vec(&json!({"library":id,"version":1}))?)?;
        self.add(&id,Entry{name:"Legacy fixture".into(),copy,exchange,source:Some(path.into()),source_hash:None,published:None,paused:false,portable:false})
    }
    // Synthetic legacy fixtures still exercise existing-library recovery and image retention.
    fn resolve_inventory(
        &self,
        id: &str,
        model: &Value,
        r: &Repository,
    ) -> Result<transfer::Inventory> {
        let vault = self.vault(id);
        let known = r.inventory()?;
        let mut source = known.clone();
        for (archive, _) in transfer::archive_names(model)? {
            if !source.contains_key(&archive) {
                let index = self
                    .root
                    .join("archive-keys")
                    .join(id)
                    .join(digest(archive.as_bytes()));
                let h = fs::read_to_string(index).map_err(|_| {
                    "Missing verified archive file. The local library was not overwritten."
                })?;
                if h.len() != 64 || !h.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Err("Invalid archive digest".into());
                }
                let bytes = fs::read(vault.join(&h))?;
                source.insert(archive, (h, bytes.len() as u64));
            }
        }
        Ok(if model["archiveIndex"] == r.archive_index()? {
            known
        } else {
            transfer::stage_archives(model, &vault, &vault, &source)?
        })
    }
    fn save(&self, id: &str, expected: &str, model: &Value) -> Result<Value> {
        let e = self.entry(id)?;
        if e.portable {
            let session = self.portable.session(id)?.ok_or("Missing portable session")?;
            if e.copy.file_name().and_then(|n| n.to_str()) != Some(&session.copy) {
                return Err("Conflict: local activation changed; pending edits retained. Reopen the portable library before saving.".into());
            }
        }
        if !e.portable || e.paused {
            return Err("Convert and verify this registered library before editing.".into());
        }
        let mut r = self.repo(id)?;
        if r.identity()?.1.as_deref() != Some(expected) {
            return Err("Conflict: local revision changed".into());
        }
        if let Some(images) = model.get("imageAssets") {
            let records = images.as_object().ok_or("Invalid image inventory")?;
            let previous: Option<String> = r.library_metadata("imageAssets")?;
            let previous: Value = previous
                .map(|text| serde_json::from_str(&text))
                .transpose()?
                .unwrap_or(Value::Null);
            for (hash, meta) in records {
                if previous.get(hash) == Some(meta) {
                    continue;
                }
                let len = meta["bytes"].as_u64().ok_or("Missing image size")?;
                let bytes = yutanohe_library::images::read_original(&self.vault(id), hash, len)?
                    .ok_or("New image original is unavailable")?;
                if Some(yutanohe_library::images::image_extension(&bytes)?)
                    != meta["extension"].as_str()
                {
                    return Err("Image format mismatch".into());
                }
            }
        }
        let inv = self.resolve_inventory(id, model, &r)?;
        lifecycle::backup_retained(&r, &self.backups(id), &self.vault(id), false)?;
        let revision = r.save_with_files(model, Some(expected), &self.cat.device, &inv)?;
        Ok(json!({"revision":revision}))
    }
    fn unused_images(&self, id: &str, undo: &Value) -> Result<Vec<(PathBuf, u64)>> {
        use std::collections::BTreeSet;
        use yutanohe_library::images::{image_extension, required};
        let e = self.entry(id)?;
        if e.paused || !e.portable {
            return Err("Verify the active library before cleanup".into());
        }
        let repo = self.repo(id)?;
        let vault = self.vault(id);
        let mut protected: BTreeSet<String> = required(&repo, &vault)?.into_keys().collect();
        for hash in undo.as_array().ok_or("Missing undo protection")? {
            protected.insert(hash.as_str().ok_or("Invalid history reference")?.into());
        }
        for (_, (hash, _)) in repo.inventory()? {
            protected.insert(hash);
        }
        let backup = self.backups(id);
        if backup.exists() {
            for file in fs::read_dir(&backup)? {
                let path = file?.path();
                if path.extension().and_then(|v| v.to_str()) != Some("sqlite") {
                    continue;
                }
                let copy = Repository::open(&path)?;
                copy.check()?;
                protected.extend(required(&copy, &vault)?.into_keys());
                for (_, (hash, _)) in copy.inventory()? {
                    protected.insert(hash);
                }
            }
        }
        let catalog: Value = serde_json::from_str(
            &repo
                .library_metadata("imageAssets")?
                .unwrap_or_else(|| "{}".into()),
        )?;
        let mut candidates = Vec::new();
        for directory in [&vault, &backup.join("objects")] {
            if !directory.exists() {
                continue;
            }
            for entry in fs::read_dir(directory)? {
                let entry = entry?;
                if !entry.file_type()?.is_file() {
                    continue;
                }
                let hash = entry.file_name().to_string_lossy().into_owned();
                if hash.len() != 64 || protected.contains(&hash) {
                    continue;
                }
                // Protect imports still between native staging and the editor's first save.
                if catalog.get(&hash).is_none()
                    && entry
                        .metadata()?
                        .modified()?
                        .elapsed()
                        .map_or(true, |age| age.as_secs() < 86400)
                {
                    continue;
                }
                let bytes = fs::read(entry.path())?;
                if digest(&bytes) == hash && image_extension(&bytes).is_ok() {
                    candidates.push((entry.path(), bytes.len() as u64));
                }
            }
        }
        candidates.sort();
        Ok(candidates)
    }
    fn image_bytes(&self, id: &str, hash: &str, len: u64) -> Result<Option<Vec<u8>>> {
        let vault = self.vault(id);
        if let Some(bytes) = yutanohe_library::images::read_original(&vault, hash, len)? {
            return Ok(Some(bytes));
        }
        Ok(None)
    }
    // Receipts are additive. Existing immutable manifests and recovery codes stay readable.

}

struct Runtime {
    store: Store,
    writable: std::collections::HashSet<String>,
    staged_images: BTreeMap<String, std::collections::BTreeSet<String>>,
    legacy_reviews: BTreeMap<String, String>,
}
#[derive(Default)]
pub struct LibraryRuntime(Mutex<Option<Runtime>>);

#[tauri::command]
pub async fn library_action(
    app: tauri::AppHandle,
    op: String,
    args: Value,
) -> std::result::Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || dispatch(app, op, args))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn dispatch(app: tauri::AppHandle, op: String, args: Value) -> Result<Value> {
    let portable_pick = if op == "portable_open" {
        let Some(file) = app.dialog().file().set_title("Open Library").add_filter("YTNH library", &["ytnh"]).blocking_pick_file() else { return Ok(Value::Null) };
        Some(file.into_path().map_err(|e| e.to_string())?)
    } else if matches!(op.as_str(), "portable_new" | "portable_transition" | "portable_save_as") {
        let Some(file) = app.dialog().file().set_title("Save Library As").add_filter("YTNH library", &["ytnh"]).set_file_name(args["name"].as_str().filter(|n| n.ends_with(".ytnh") && !n.contains(['/', '\\'])).unwrap_or("Library.ytnh")).blocking_save_file() else { return Ok(Value::Null) };
        Some(file.into_path().map_err(|e| e.to_string())?)
    } else { None };
    let picked = if matches!(
        op.as_str(),
        "export" | "export_markdown"
    ) {
        let prompt = match op.as_str() {
            "export_markdown" => "Choose a folder for the Markdown document package",
            _ => "Choose a folder for a complete JSON recovery export",
        };
        let Some(file) = app.dialog().file().set_title(prompt).blocking_pick_folder() else {
            return Ok(Value::Null);
        };
        Some(file.into_path().map_err(|e| e.to_string())?)
    } else {
        None
    };
    let state = app.state::<LibraryRuntime>();
    let mut guard = state.0.lock().map_err(|_| "Library service unavailable")?;
    if guard.is_none() {
        *guard = Some(Runtime {
            store: Store::open(app.path().app_local_data_dir()?.join("libraries-v1"))?,
            writable: Default::default(),
            staged_images: Default::default(),
            legacy_reviews: Default::default(),
        })
    }
    let runtime = guard.as_mut().unwrap();
    let store = &mut runtime.store;
    store.check_catalog_action(&op)?;
    if let Some(path) = &portable_pick {
        let parent=path.parent().ok_or("The library file's folder is missing")?.canonicalize()?;
        if parent.starts_with(store.root.canonicalize()?) { return Err("Choose a location outside YTNH's own data folder".into()) }
    }
    let id = args["id"].as_str().unwrap_or("");
    if matches!(
        op.as_str(),
        "import_image"
            | "import_reference"
            | "archive"
            | "restore_backup"
            | "save"
    ) && !runtime.writable.contains(id)
    {
        return Err("Verify this library before editing".into());
    }

    if matches!(op.as_str(), "portable_publish" | "portable_save_as") && !runtime.writable.contains(id) { return Err("Open and verify the library first".into()) }
    match op.as_str() {
        "legacy_review" => {
            let result = store.review_legacy(id)?;
            runtime.legacy_reviews.insert(id.into(), arg(&result,"revision")?.into());
            Ok(result)
        },
        "portable_transition" => {
            let revision = arg(&args,"revision")?;
            if runtime.legacy_reviews.get(id).map(String::as_str) != Some(revision) {
                return Err("Review the local library before converting".into());
            }
            let result = store.transition_legacy(id, revision, portable_pick.as_deref().unwrap())?;
            runtime.legacy_reviews.remove(id);
            runtime.writable.insert(id.into());
            Ok(result)
        },
        "portable_recovery_list" => {
            let mut report = store.portable.recovery_report()?;
            if let Some(issue)=&store.catalog_issue { report.issues.push(portable::RecoveryIssue { copy:"Library list".into(), error:issue.clone() }); }
            Ok(json!({"copies":report.copies.into_iter().map(|copy| json!({"copy":copy.session.copy,"id":copy.session.library,"name":copy.session.master.file_name().unwrap_or_default().to_string_lossy(),"revision":Repository::open(&copy.database()).and_then(|r|r.identity()).ok().and_then(|x|x.1),"unpublished":copy.unpublished})).collect::<Vec<_>>(),"issues":report.issues}))
        },
        "portable_adopt" => {
            let result=store.adopt_portable(arg(&args,"copy")?)?;
            runtime.writable.insert(arg(&result,"id")?.to_owned());
            Ok(result)
        }
        "portable_open" | "portable_new" | "portable_save_as" | "portable_publish" | "portable_reopen" | "portable_recover" => {
            let result = match op.as_str() {
                "portable_open" => store.open_master(portable_pick.as_deref().unwrap())?,
                "portable_new" => store.new_portable(&args["model"], portable_pick.as_deref().unwrap())?,
                "portable_publish" | "portable_save_as" => store.portable_publish(id, arg(&args,"revision")?, portable_pick.as_deref())?,
                "portable_reopen" => {
                    let copy = store.portable.reopen(id)?;
                    store.attach_portable(copy)?
                },
                _ => {
                    store.portable.reconcile_publication(id)?;
                    let copy = store.portable.recover(id)?.ok_or("No verified local recovery copy")?;
                    store.attach_portable(copy)?
                },
            };
            runtime.writable.insert(arg(&result,"id")?.to_owned());
            Ok(result)
        }
        #[cfg(feature = "inline-images-preview")]
        "import_reference" => {
            if store.entry(id)?.paused {
                return Err("Sending copy is paused".into());
            }
            let reference = arg(&args, "reference")?;
            let (name, bytes) = if reference.starts_with("https://") {
                crate::image_import::download(reference)?
            } else {
                let choice = app
                    .dialog()
                    .file()
                    .set_title("Choose the image referenced in Source")
                    .add_filter(
                        "Images",
                        &["png", "jpg", "jpeg", "webp", "gif", "svg", "heif", "heic"],
                    )
                    .blocking_pick_file();
                let Some(choice) = choice else {
                    return Ok(Value::Null);
                };
                let chosen = choice.into_path().map_err(|e| e.to_string())?;
                let name = chosen
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Image")
                    .to_owned();
                (name, fs::read(chosen)?)
            };
            if bytes.len() > yutanohe_library::images::CONFIRM_BYTES
                && !app
                    .dialog()
                    .message(format!(
                        "Import {} ({:.1} MB)?",
                        name,
                        bytes.len() as f64 / 1048576.0
                    ))
                    .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                    .blocking_show()
            {
                return Ok(Value::Null);
            }
            let original =
                yutanohe_library::images::store_original(&store.vault(id), &bytes, true)?;
            runtime
                .staged_images
                .entry(id.into())
                .or_default()
                .insert(original.hash.clone());
            Ok(
                json!({"hash":original.hash,"extension":original.extension,"bytes":original.bytes,"name":name}),
            )
        }
        #[cfg(feature = "inline-images-preview")]
        "import_image" => {
            use base64::Engine;
            if store.entry(id)?.paused {
                return Err("Sending copy is paused".into());
            }
            let bytes = base64::engine::general_purpose::STANDARD.decode(arg(&args, "data")?)?;
            let original = yutanohe_library::images::store_original(
                &store.vault(id),
                &bytes,
                args["confirmed"].as_bool() == Some(true),
            )?;
            runtime
                .staged_images
                .entry(id.into())
                .or_default()
                .insert(original.hash.clone());
            Ok(json!({"hash":original.hash,"extension":original.extension,"bytes":original.bytes}))
        }
        #[cfg(feature = "inline-images-preview")]
        "read_image" | "open_image" => {
            use base64::Engine;
            store.entry(id)?;
            let hash = arg(&args, "hash")?;
            let len = args["bytes"].as_u64().ok_or("Missing image size")?;
            let Some(bytes) = store.image_bytes(id, hash, len)? else {
                if op == "open_image" {
                    return Err("Image not yet available".into());
                }
                return Ok(Value::Null);
            };
            if yutanohe_library::images::image_extension(&bytes)? != arg(&args, "extension")? {
                return Err("Invalid image format".into());
            }
            if op == "open_image" {
                use tauri_plugin_opener::OpenerExt;
                let ext = arg(&args, "extension")?;
                if ext == "svg" && !app.dialog()
                    .message("Your default viewer may run scripts or load external resources in this SVG. Open the untouched original?")
                    .title("Open original SVG")
                    .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom("Open original".into(),"Cancel".into()))
                    .blocking_show() {
                    return Ok(Value::Null);
                }
                let path = app
                    .path()
                    .app_cache_dir()?
                    .join("original-images")
                    .join(id)
                    .join(format!("{hash}.{ext}"));
                transfer::immutable(&path, &bytes)?;
                app.opener()
                    .open_path(path.to_string_lossy(), None::<&str>)?;
                return Ok(Value::Null);
            }
            let ext = arg(&args, "extension")?;
            let preview = crate::image_preview::preview(
                &store.vault(id).join(hash),
                &bytes,
                ext,
                &app.path()
                    .app_cache_dir()?
                    .join("image-previews-v1")
                    .join(id),
            );
            let rendered = match preview {
                Ok(Some(png)) => ("png", png),
                _ if ext == "heif" => return Ok(json!({"unavailable":true})),
                _ => (ext, bytes),
            };
            Ok(
                json!({"extension":rendered.0,"data":base64::engine::general_purpose::STANDARD.encode(rendered.1)}),
            )
        }
        "clean_images" => {
            if !runtime.writable.contains(id) {
                return Err("Verify this library before cleanup".into());
            }
            let mut protected = args["undo"]
                .as_array()
                .ok_or("Missing undo history")?
                .clone();
            if let Some(staged) = runtime.staged_images.get(id) {
                protected.extend(staged.iter().map(|h| json!(h)));
            }
            let files = store.unused_images(id, &Value::Array(protected))?;
            let token = digest(&serde_json::to_vec(&files)?);
            if let Some(expected) = args["confirm"].as_str() {
                if expected != token {
                    return Err("The library changed. Review the cleanup again.".into());
                }
                // Every candidate is independently unreachable. Retrying after an interruption
                // recomputes reachability and removes only the remaining verified files.
                for (path, _) in &files {
                    fs::remove_file(path)?;
                }
            }
            Ok(
                json!({"token":token,"count":files.len(),"bytes":files.iter().map(|(_,n)|*n).sum::<u64>()}),
            )
        }
        "export_markdown" => {
            let root = picked.ok_or("Choose an export folder")?;
            let r = store.repo(id)?;
            let model = r.load()?;
            let item = model["items"]
                .as_array()
                .and_then(|xs| xs.iter().find(|v| v["id"] == args["item"]))
                .or_else(|| model["planner"]["meetings"].get(args["item"].as_str()?))
                .ok_or("Item unavailable")?;
            let body = arg(item, "content")?;
            let title = arg(item, "title")?;
            let mut inventory = yutanohe_library::images::Inventory::new();
            yutanohe_library::images::collect_references(
                body,
                &model["imageAssets"],
                &mut inventory,
            )?;
            for (hash, (_, bytes)) in &inventory {
                store
                    .image_bytes(id, hash, *bytes)?
                    .ok_or("Required image not yet available")?;
            }
            let temp = tempfile::tempdir_in(&root)?;
            yutanohe_library::images::export_files(&inventory, &store.vault(id), temp.path())?;
            transfer::immutable(
                &temp.path().join("document.md"),
                format!("# {title}\n\n{body}").as_bytes(),
            )?;
            let name = title
                .chars()
                .filter(|c| c.is_alphanumeric() || matches!(c, '-' | ' '))
                .take(45)
                .collect::<String>();
            let path = root.join(format!("{}-{}", name.trim(), Uuid::new_v4()));
            fs::rename(temp.path(), &path)?;
            Ok(json!(path.to_string_lossy()))
        }
        "list" => Ok(Value::Array(
            store
                .cat
                .libraries
                .iter()
                .map(|(id, e)| json!({"id":id,"name":e.name,"portable":e.portable}))
                .collect(),
        )),
        "last" => Ok(json!(store.cat.last)),
        "remember" => {
            if !id.is_empty() {
                store.entry(id)?;
            }
            if store.cat.last.as_deref() == Some(id) || id.is_empty() && store.cat.last.is_none() {
                return Ok(Value::Null);
            }
            store.cat.last = if id.is_empty() { None } else { Some(id.into()) };
            store.persist()?;
            Ok(Value::Null)
        }
        "status" => store.status(id),
        "read" => {
            let r = store.repo(id)?;
            Ok(json!({"model":r.load()?,"revision":r.identity()?.1}))
        }
        "save" => {
            let saved = store.save(id, arg(&args, "revision")?, &args["model"])?;
            if let Some(staged) = runtime.staged_images.get_mut(id) {
                staged.retain(|h| args["model"]["imageAssets"].get(h).is_none());
            }
            Ok(saved)
        }
        "archive" => {
            let e = store.entry(id)?;
            if e.paused {
                return Err("Sending copy is paused".into());
            }
            let raw = arg(&args, "text")?.as_bytes();
            let archive: Value = serde_json::from_slice(raw)?;
            if archive["format"] != "local-notes-todos-cold-archive" {
                return Err("Unexpected file format".into());
            }
            let key = arg(&archive, "archiveId")?;
            let h = digest(raw);
            transfer::immutable(&store.vault(id).join(&h), raw)?;
            transfer::immutable(
                &store
                    .root
                    .join("archive-keys")
                    .join(id)
                    .join(digest(key.as_bytes())),
                h.as_bytes(),
            )?;
            Ok(Value::Null)
        }
        "read_archive" => {
            let r = store.repo(id)?;
            let key = arg(&args, "archive")?;
            let inv = r.inventory()?;
            let (h, _) = inv.get(key).ok_or("Unknown archive")?;
            let b = fs::read(store.vault(id).join(h))?;
            if digest(&b) != *h {
                return Err("Archive checksum mismatch".into());
            }
            transfer::verify_archive(&r.load()?, key, &b)?;
            Ok(json!(String::from_utf8(b)?))
        }
        "backups" => {
            store.entry(id)?;
            let folder = store.backups(id);
            let mut names = vec![];
            if folder.exists() {
                for e in fs::read_dir(folder)? {
                    let p = e?.path();
                    if p.extension().and_then(|x| x.to_str()) == Some("sqlite") {
                        names.push(p.file_name().unwrap().to_string_lossy().to_string())
                    }
                }
            }
            if store.entry(id)?.portable {
                let legacy=store.root.join("backups").join(id);
                if legacy.exists() { for entry in fs::read_dir(legacy)? {
                    let path=entry?.path();
                    if path.extension().and_then(|x|x.to_str())==Some("sqlite") { names.push(format!("legacy-{}",path.file_name().unwrap().to_string_lossy())); }
                }}
            }
            names.sort();
            names.reverse();
            Ok(json!(names))
        }
        "restore_backup" => {
            let e = store.entry(id)?;
            if !e.portable || e.paused {
                return Err("Convert and verify this registered library before restoring a backup".into());
            }
            // Copy to local scratch; never open a user-selected file for writing.
            let temp = tempfile::tempdir_in(&store.root)?;
            let path = temp.path().join("backup");
            let name = arg(&args, "backup")?;
            transfer::safe_leaf(name)?;
            if !name.ends_with(".sqlite") {
                return Err("Choose a local backup".into());
            }
            let (backup_folder, filename)=if e.portable && name.starts_with("legacy-") {
                (store.root.join("backups").join(id),name.strip_prefix("legacy-").unwrap())
            } else { (store.backups(id),name) };
            transfer::safe_leaf(filename)?;
            fs::copy(backup_folder.join(filename), &path)?;
            let backup = Repository::open(&path)?;
            backup.check()?;
            if backup.identity()?.0 != id {
                return Err("Backup belongs to another library".into());
            }
            for (_, (hash, len)) in backup.inventory()? {
                if let Some(bytes) = yutanohe_library::images::read_original(
                    &backup_folder.join("objects"),
                    &hash,
                    len,
                )? {
                    transfer::immutable(&store.vault(id).join(hash), &bytes)?;
                }
            }
            let images = yutanohe_library::images::required(&backup, &store.vault(id))?;
            yutanohe_library::images::copy_required(
                &images,
                &backup_folder.join("objects"),
                &store.vault(id),
                false,
            )?;
            let model = backup.load()?;
            let inv = backup.inventory()?;
            transfer::stage_archives(&model, &store.vault(id), &store.vault(id), &inv)?;
            let mut r = store.repo(id)?;
            lifecycle::backup_retained(&r, &store.backups(id), &store.vault(id), true)?;
            let rev = r.save_with_files(
                &model,
                Some(arg(&args, "revision")?),
                &store.cat.device,
                &inv,
            )?;
            Ok(json!({"revision":rev,"model":model}))
        }
        "export" => {
            let r = store.repo(id)?;
            let temp = tempfile::tempdir_in(&store.root)?;
            let path = temp.path().join("export.sqlite");
            r.snapshot(&path)?;
            let mut r = Repository::open(&path)?;
            if let Some(model) = args.get("model") {
                let head = r.identity()?.1;
                let inv = store.resolve_inventory(id, model, &r)?;
                r.save_with_files(model, head.as_deref(), &store.cat.device, &inv)?;
            }
            let folder = picked
                .unwrap()
                .join(format!("YTNH-recovery-{}", Uuid::new_v4()));
            let out = lifecycle::export_recovery(&r, &store.vault(id), &folder)?;
            Ok(json!(out))
        }
        _ => Err("Unknown library operation".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn copy_fixture(folder: &Path) -> Result<PathBuf> {
        fs::create_dir_all(folder)?;
        fs::write(
            folder.join("library.json"),
            include_bytes!("../../crates/library/tests/fixtures/library.json"),
        )?;
        fs::write(
            folder.join("cold-archive.json"),
            include_bytes!("../../crates/library/tests/fixtures/cold-archive.json"),
        )?;
        Ok(folder.join("library.json"))
    }
    #[test]
    fn damaged_catalog_allows_only_explicit_verified_recovery() -> Result<()> {
        let d=tempfile::tempdir()?;let root=d.path().join("local");let mut store=Store::open(root.clone())?;
        let mut model:Value=serde_json::from_slice(include_bytes!("../../crates/library/tests/fixtures/library.json"))?;model["archiveIndex"]=json!([]);
        let master=d.path().join("Library.ytnh");let info=store.new_portable(&model,&master)?;let id=arg(&info,"id")?.to_owned();
        let copy=store.portable.session(&id)?.unwrap().copy;let original=fs::read(&master)?;drop(store);
        fs::write(root.join("catalog.json"),b"damaged catalog")?;
        let mut store=Store::open(root.clone())?;assert!(store.catalog_issue.is_some());assert!(store.persist().is_err());
        for action in ["portable_new","portable_open","save","last"] { assert!(store.check_catalog_action(action).is_err()); }
        assert!(store.check_catalog_action("portable_recovery_list").is_ok());
        assert_eq!(store.portable.recovery_report()?.copies.len(),1);
        assert!(store.adopt_portable("invalid-copy").is_err());assert_eq!(fs::read(root.join("catalog.json"))?,b"damaged catalog");
        store.adopt_portable(&copy)?;assert!(store.catalog_issue.is_none());assert_eq!(store.repo(&id)?.load()?,model);
        assert_eq!(fs::read(&master)?,original);
        for e in fs::read_dir(root.join("catalog-recovery"))? { assert_eq!(fs::read(e?.path())?,b"damaged catalog"); }
        drop(store);assert_eq!(Store::open(root)?.repo(&id)?.load()?,model);Ok(())
    }
    #[test]
    fn registered_legacy_transition_preserves_paused_source_and_rejects_stale_review() -> Result<()> {
        let d=tempfile::tempdir()?;
        let source=copy_fixture(&d.path().join("source"))?;
        let mut store=Store::open(d.path().join("local"))?;
        let record=store.seed_legacy(&source)?;
        let id=arg(&record,"id")?.to_owned();
        store.cat.libraries.get_mut(&id).unwrap().paused=true;store.persist()?;
        let old=store.entry(&id)?;let original=fs::read(old.copy.join("library.sqlite"))?;
        let reviewed=store.review_legacy(&id)?;assert_eq!(reviewed["paused"],true);
        let master=d.path().join("Converted.ytnh");
        assert!(store.transition_legacy(&id,"stale",&master).is_err());assert!(!master.exists());
        assert_eq!(fs::read(old.copy.join("library.sqlite"))?,original);
        let archive=store.repo(&id)?.inventory()?.values().next().unwrap().0.clone();
        let object=store.vault(&id).join(archive);let bytes=fs::read(&object)?;
        fs::write(&object,b"broken")?;assert!(store.review_legacy(&id).is_err());
        assert!(store.transition_legacy(&id,arg(&reviewed,"revision")?,&master).is_err());assert!(!master.exists());
        fs::write(&object,bytes)?;
        let converted=store.transition_legacy(&id,arg(&reviewed,"revision")?,&master)?;
        assert_eq!(converted["id"],id);assert_eq!(converted["portable"],true);
        assert_eq!(fs::read(old.copy.join("library.sqlite"))?,original);
        assert!(old.exchange.exists());assert!(source.exists());
        Ok(())
    }
    #[test]
    fn portable_conversion_local_save_publish_and_conflict() -> Result<()> {
        let d=tempfile::tempdir()?;
        let source=copy_fixture(&d.path().join("source"))?;
        let original=fs::read(&source)?;
        let mut store=Store::open(d.path().join("local"))?;
        let record=store.seed_legacy(&source)?;
        let id=arg(&record,"id")?.to_owned();
        let legacy=store.entry(&id)?; let legacy_db=fs::read(legacy.copy.join("library.sqlite"))?;
        let master=d.path().join("Library.ytnh");
        let portable=store.convert_portable(&id,&master)?;
        assert_eq!(portable["portable"],true);
        assert_eq!(fs::read(&source)?,original); assert_eq!(fs::read(legacy.copy.join("library.sqlite"))?,legacy_db);
        assert!(legacy.exchange.join("library.identity.json").exists());
        assert!(store.root.join("legacy-entries").exists());
        let master_before=fs::read(&master)?;
        let mut model=store.repo(&id)?.load()?; model["items"][0]["title"]=json!("Portable local edit");
        let saved=store.save(&id,arg(&portable,"revision")?,&model)?;
        assert_eq!(fs::read(&master)?,master_before); assert_eq!(store.status(&id)?["unpublished"],true);
        assert!(fs::read_dir(store.backups(&id))?.any(|e|e.unwrap().path().extension().is_some_and(|x|x=="sqlite")));
        let published=store.portable_publish(&id,arg(&saved,"revision")?,None)?;
        assert_eq!(published["unpublished"],false);
        let verified=portable::verify(&master,d.path(),portable::Limits::default())?;
        assert_eq!(Repository::open(&verified.database())?.load()?,model);
        fs::write(&master,b"other computer changed this")?;
        assert!(store.portable_publish(&id,arg(&saved,"revision")?,None).is_err());
        assert_eq!(fs::read(&master)?,b"other computer changed this");
        let new=d.path().join("Recovered.ytnh");
        store.portable_publish(&id,arg(&saved,"revision")?,Some(&new))?;
        drop(store);
        let store=Store::open(d.path().join("local"))?;
        assert!(store.entry(&id)?.portable); assert_eq!(store.repo(&id)?.load()?,model);
        assert_eq!(store.portable.session(&id)?.unwrap().master,new.canonicalize()?);
        Ok(())
    }
    #[test]
    fn stale_catalog_pointer_cannot_accept_writes_after_failed_activation() -> Result<()> {
        let d=tempfile::tempdir()?; let mut store=Store::open(d.path().join("local"))?;
        let mut model:Value=serde_json::from_slice(include_bytes!("../../crates/library/tests/fixtures/library.json"))?;
        model["archiveIndex"]=json!([]);
        let master=d.path().join("Library.ytnh"); let initial=store.new_portable(&model,&master)?;
        let id=arg(&initial,"id")?.to_owned(); let old=store.entry(&id)?;
        let other=portable::WorkingStore::open(&d.path().join("other"),portable::Limits::default())?;
        let copy=other.load(&master)?; let mut repo=Repository::open(&copy.database())?;
        model["items"][0]["title"]=json!("Remote change"); let head=repo.save(&model,repo.identity()?.1.as_deref(),"remote")?;
        other.publish(&id,&head,None)?;
        // Advance the durable working pointer without updating the host catalog, as after
        // a failed catalog write. The old UI revision must not write into the retired copy.
        store.portable.load(&master)?;
        assert!(store.save(&id,arg(&initial,"revision")?,&model).is_err());
        assert_eq!(Repository::open(&old.copy.join("library.sqlite"))?.identity()?.1.as_deref(),initial["revision"].as_str());
        store.open_master(&master)?;
        assert_eq!(store.repo(&id)?.load()?,model);
        Ok(())
    }
    #[test]
    fn image_cleanup_protects_history_backups_and_published_objects() -> Result<()> {
        use yutanohe_library::images::store_original;
        let d = tempfile::tempdir()?;
        let cloud = d.path().join("cloud");
        fs::create_dir(&cloud)?;
        let mut store = Store::open(d.path().join("local"))?;
        let model: Value = serde_json::from_slice(include_bytes!(
            "../../crates/library/tests/fixtures/library.json"
        ))?;
        let mut base = model.clone();
        base["archiveIndex"] = json!([]);
        let record = store.new_portable(&base, &cloud.join("Images.ytnh"))?;
        let id = arg(&record, "id")?;
        let vault = store.vault(id);
        let active = store_original(
            &vault,
            include_bytes!("../../crates/library/tests/fixtures/images/pixel.gif"),
            false,
        )?;
        let unused = store_original(
            &vault,
            include_bytes!("../../crates/library/tests/fixtures/images/pixel.jpeg"),
            false,
        )?;
        for image in [&active, &unused] {
            base["imageAssets"][&image.hash] =
                json!({"bytes":image.bytes,"extension":image.extension})
        }
        base["items"][0]["content"] = json!(format!("![X](assets/{}.gif)", active.hash));
        let first = store.save(id, arg(&record, "revision")?, &base)?;
        let plain = store.unused_images(id, &json!([]))?;
        assert_eq!(plain.len(), 1);
        assert_eq!(plain[0].0, vault.join(&unused.hash));
        assert!(store.unused_images(id, &json!([unused.hash]))?.is_empty());
        let repo = store.repo(id)?;
        lifecycle::backup_retained(&repo, &store.backups(id), &vault, true)?;
        store.portable_publish(id,arg(&first,"revision")?,None)?;
        base["items"][0]["content"] = json!("Removed");
        store.save(id, arg(&first, "revision")?, &base)?;
        assert!(store
            .unused_images(id, &json!([]))?
            .iter()
            .all(|(p, _)| p != &vault.join(&active.hash)));
        Ok(())
    }
    #[test]
    fn missing_archive_never_activates_or_writes_source() -> Result<()> {
        let d = tempfile::tempdir()?;
        let source = copy_fixture(d.path())?;
        fs::remove_file(d.path().join("cold-archive.json"))?;
        let bytes = fs::read(&source)?;
        let mut store = Store::open(d.path().join("local"))?;
        assert!(store
            .seed_legacy(&source)
            .unwrap_err()
            .to_string()
            .contains("Locate the cold archive"));
        assert!(store.cat.last.is_none());
        assert!(store.cat.libraries.is_empty());
        assert_eq!(fs::read(source)?, bytes);
        Ok(())
    }
}
