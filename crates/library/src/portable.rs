//! Portable master v1, durable local working copies and verified publication.
//! Creation never overwrites a file; publication uses the explicit expected fingerprint.
//! No cloud coordination or provider-specific behavior is implemented.
//! Hosts must supply an application-controlled LOCAL root, not a synced directory.
mod publication;

use crate::{canonical, images, transfer, Repository, Result, V};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use tempfile::{NamedTempFile, TempDir};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const FORMAT: &str = "yutanohe-portable-master";
const VERSION: u32 = 1;
const MANIFEST_LIMIT: u64 = 8 * 1024 * 1024;

/// Explicit resource ceilings, not silent truncation. Hosts may raise them after checking disk space.
#[derive(Clone, Copy)]
pub struct Limits {
    pub bytes: u64,
    pub entries: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            bytes: 64 * 1024 * 1024 * 1024,
            entries: 100_000,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct FileDigest {
    pub sha256: String,
    pub bytes: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    /// Exact snapshot revision metadata, verified against SQLite, not the live source.
    pub state: V,
    pub database: FileDigest,
    pub database_schema: u32,
    pub objects: BTreeMap<String, u64>,
}
pub struct Verified {
    directory: TempDir,
    pub manifest: Manifest,
    pub fingerprint: FileDigest,
}
impl Verified {
    pub fn database(&self) -> PathBuf {
        self.directory.path().join("library.sqlite")
    }
    pub fn objects(&self) -> PathBuf {
        self.directory.path().join("objects")
    }
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn regular(path: &Path) -> Result<File> {
    if !fs::symlink_metadata(path)?.file_type().is_file() {
        return Err("Expected an ordinary file, not a link or directory".into());
    }
    Ok(File::open(path)?)
}
/// Bounded streaming copy/hash; does not allocate according to untrusted entry sizes.
fn copy_hash(reader: &mut impl Read, writer: &mut impl Write, limit: u64) -> Result<FileDigest> {
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        bytes = bytes.checked_add(n as u64).ok_or("File size overflow")?;
        if bytes > limit {
            return Err("Portable file exceeds the configured size limit".into());
        }
        writer.write_all(&buffer[..n])?;
        hash.update(&buffer[..n]);
    }
    Ok(FileDigest {
        sha256: format!("{:x}", hash.finalize()),
        bytes,
    })
}
pub fn fingerprint(path: &Path, limit: u64) -> Result<FileDigest> {
    copy_hash(&mut regular(path)?, &mut std::io::sink(), limit)
}
fn sync_dir(path: &Path) -> Result<()> {
    // Windows does not expose POSIX directory fsync. Each file is flushed before activation.
    #[cfg(unix)]
    File::open(path)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
fn required(repo: &Repository, vault: &Path, limits: Limits) -> Result<BTreeMap<String, u64>> {
    repo.check()?;
    let model = repo.load()?;
    let missing_catalog = repo.library_metadata("imageAssets")?.is_none();
    let check_uncatalogued = |content: &str| -> Result<()> {
        if missing_catalog {
            images::collect_references(content, &V::Null, &mut Default::default())?;
        }
        Ok(())
    };
    if missing_catalog {
        for item in model["items"].as_array().ok_or("Missing items")? {
            check_uncatalogued(item["content"].as_str().unwrap_or(""))?;
        }
        if let Some(meetings) = model["planner"]["meetings"].as_object() {
            for meeting in meetings.values() {
                check_uncatalogued(meeting["content"].as_str().unwrap_or(""))?;
            }
        }
    }
    let mut objects = BTreeMap::new();
    let mut add = |hash: String, bytes: u64| -> Result<()> {
        if !valid_hash(&hash) {
            return Err("Invalid managed object hash".into());
        }
        if let Some(old) = objects.insert(hash, bytes) {
            if old != bytes {
                return Err("Conflicting object lengths".into());
            }
        }
        Ok(())
    };
    for (id, (hash, bytes)) in repo.inventory()? {
        if !valid_hash(&hash) || bytes > limits.bytes {
            return Err("Invalid archive inventory".into());
        }
        if fingerprint(&vault.join(&hash), limits.bytes)?
            != (FileDigest {
                sha256: hash.clone(),
                bytes,
            })
        {
            return Err("Cold archive failed verification".into());
        }
        // Reuse existing archive semantic validation; all path checks precede reading.
        let archive_bytes = fs::read(vault.join(&hash))?;
        transfer::verify_archive(&model, &id, &archive_bytes)?;
        if missing_catalog {
            let archive: V = serde_json::from_slice(&archive_bytes)?;
            for item in archive["items"]
                .as_array()
                .ok_or("Missing archived items")?
            {
                check_uncatalogued(item["content"].as_str().unwrap_or(""))?;
            }
        }
        add(hash, bytes)?;
    }
    for (hash, (_, bytes)) in images::required(repo, vault)? {
        add(hash, bytes)?;
    }
    if objects.len().saturating_add(2) > limits.entries {
        return Err("Too many managed objects".into());
    }
    let mut total = 0u64;
    for (hash, bytes) in &objects {
        total = total.checked_add(*bytes).ok_or("Object size overflow")?;
        if total > limits.bytes {
            return Err("Managed objects exceed the configured size limit".into());
        }
        if fingerprint(&vault.join(hash), limits.bytes)?
            != (FileDigest {
                sha256: hash.clone(),
                bytes: *bytes,
            })
        {
            return Err("Required managed file is missing or damaged".into());
        }
    }
    Ok(objects)
}
fn options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .large_file(true)
}

/// Create a NEW verified master. Existing destinations are never overwritten, even after picker races.
/// The source database, vault and old handoff directories are read-only inputs.
pub fn create(
    repo: &Repository,
    vault: &Path,
    destination: &Path,
    local_stage: &Path,
    limits: Limits,
) -> Result<Manifest> {
    if destination.exists() {
        return Err("Destination already exists; choose a new master filename".into());
    }
    fs::create_dir_all(local_stage)?;
    let stage = tempfile::tempdir_in(local_stage)?;
    let snapshot_path = stage.path().join("library.sqlite");
    repo.snapshot(&snapshot_path)?;
    let snapshot = Repository::open(&snapshot_path)?;
    let objects = required(&snapshot, vault, limits)?;
    let manifest = Manifest {
        format: FORMAT.into(),
        version: VERSION,
        state: snapshot.revision_info()?,
        database_schema: snapshot
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))?,
        database: fingerprint(&snapshot_path, limits.bytes)?,
        objects,
    };
    drop(snapshot);
    let manifest_bytes = serde_json::to_vec(&manifest)?;
    if manifest_bytes.len() as u64 > MANIFEST_LIMIT {
        return Err("Manifest exceeds the supported size".into());
    }
    let parent = destination
        .parent()
        .ok_or("Missing destination directory")?;
    let mut candidate = NamedTempFile::new_in(parent)?;
    {
        let mut zip = ZipWriter::new(candidate.as_file_mut());
        zip.start_file("manifest.json", options())?;
        zip.write_all(&manifest_bytes)?;
        zip.start_file("library.sqlite", options())?;
        if copy_hash(&mut regular(&snapshot_path)?, &mut zip, limits.bytes)? != manifest.database {
            return Err("Snapshot changed while packaging".into());
        }
        for (hash, bytes) in &manifest.objects {
            zip.start_file(format!("objects/{hash}"), options())?;
            if copy_hash(&mut regular(&vault.join(hash))?, &mut zip, limits.bytes)?
                != (FileDigest {
                    sha256: hash.clone(),
                    bytes: *bytes,
                })
            {
                return Err("Managed file changed while packaging".into());
            }
        }
        zip.finish()?;
    }
    candidate.as_file().sync_all()?;
    let verified = verify(candidate.path(), local_stage, limits)?;
    if verified.manifest != manifest {
        return Err("Package verification mismatch".into());
    }
    let expected = verified.fingerprint.clone();
    drop(verified);
    candidate
        .persist_noclobber(destination)
        .map_err(|e| e.error)?;
    sync_dir(parent)?;
    if fingerprint(destination, limits.bytes)? != expected {
        return Err("Master changed after creation; source library retained".into());
    }
    Ok(manifest)
}

// Bound ZIP metadata BEFORE the dependency allocates its central-directory index.
// Version 1 writes single-volume archives with no archive comment. General ZIP files are
// not a supported import format. Actual header/content validation remains in the ZIP library.
fn preflight_zip(file: &mut File, limits: Limits) -> Result<()> {
    let length = file.metadata()?.len();
    if length < 22 {
        return Err("Truncated portable file".into());
    }
    file.seek(SeekFrom::End(-22))?;
    let mut end = [0u8; 22];
    file.read_exact(&mut end)?;
    let u16_at = |at| u16::from_le_bytes([end[at], end[at + 1]]);
    let u32_at = |at| u32::from_le_bytes(end[at..at + 4].try_into().unwrap());
    if &end[..4] != b"PK\x05\x06"
        || u16_at(4) != 0
        || u16_at(6) != 0
        || u16_at(20) != 0
        || u16_at(8) != u16_at(10)
    {
        return Err("Unsupported portable ZIP footer".into());
    }
    let mut count = u16_at(10) as u64;
    let mut size = u32_at(12) as u64;
    let mut offset = u32_at(16) as u64;
    if count == u16::MAX as u64 || size == u32::MAX as u64 || offset == u32::MAX as u64 {
        if length < 98 {
            return Err("Truncated ZIP64 footer".into());
        }
        file.seek(SeekFrom::End(-42))?;
        let mut locator = [0u8; 20];
        file.read_exact(&mut locator)?;
        if &locator[..4] != b"PK\x06\x07"
            || locator[4..8] != [0; 4]
            || locator[16..20] != [1, 0, 0, 0]
        {
            return Err("Unsupported multi-volume ZIP64".into());
        }
        let position = u64::from_le_bytes(locator[8..16].try_into()?);
        if position > length - 98 {
            return Err("Invalid ZIP64 position".into());
        }
        file.seek(SeekFrom::Start(position))?;
        let mut footer = [0u8; 56];
        file.read_exact(&mut footer)?;
        if &footer[..4] != b"PK\x06\x06"
            || footer[16..24] != [0; 8]
            || footer[24..32] != footer[32..40]
        {
            return Err("Invalid ZIP64 directory".into());
        }
        count = u64::from_le_bytes(footer[32..40].try_into()?);
        size = u64::from_le_bytes(footer[40..48].try_into()?);
        offset = u64::from_le_bytes(footer[48..56].try_into()?);
    }
    if count < 2
        || count > limits.entries as u64
        || size > 32 * 1024 * 1024
        || offset.checked_add(size).is_none_or(|end| end > length - 22)
    {
        return Err("Portable ZIP directory exceeds supported limits".into());
    }
    file.seek(SeekFrom::Start(0))?;
    Ok(())
}

/// Validate a local copy before opening SQLite; never open the selected master as a database.
/// No extraction to caller-controlled ZIP paths and no activation on partial verification.
pub fn verify(master: &Path, local_stage: &Path, limits: Limits) -> Result<Verified> {
    fs::create_dir_all(local_stage)?;
    let directory = tempfile::tempdir_in(local_stage)?;
    let package = directory.path().join("package.ytnh");
    let mut output = File::create(&package)?;
    let fingerprint = copy_hash(&mut regular(master)?, &mut output, limits.bytes)?;
    output.sync_all()?;
    drop(output);
    if self::fingerprint(master, limits.bytes)? != fingerprint {
        return Err("Master changed while reading; retry".into());
    }
    let mut package_file = File::open(&package)?;
    preflight_zip(&mut package_file, limits)?;
    let mut zip = ZipArchive::new(package_file)?;
    if zip.len() < 2 || zip.len() > limits.entries || zip.has_duplicate_names() {
        return Err("Invalid portable entry count or duplicate entries".into());
    }
    zip.validate_header_consistency()?;
    let mut names = BTreeMap::new();
    let mut total = 0u64;
    for i in 0..zip.len() {
        let entry = zip.by_index(i)?;
        let name = entry.name()?.into_owned();
        let allowed = name == "manifest.json"
            || name == "library.sqlite"
            || name.strip_prefix("objects/").is_some_and(valid_hash);
        let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
        if !allowed
            || entry.is_dir()
            || entry.is_symlink()
            || (mode != 0 && mode != 0o100000)
            || entry.encrypted()
            || entry.compression() != CompressionMethod::Stored
            || entry.compressed_size() != entry.size()
        {
            return Err("Unsupported or unsafe portable entry".into());
        }
        total = total
            .checked_add(entry.size())
            .ok_or("Entry size overflow")?;
        if total > limits.bytes || names.insert(name, entry.size()).is_some() {
            return Err("Invalid portable entries".into());
        }
    }
    if names.get("manifest.json").copied().unwrap_or(u64::MAX) > MANIFEST_LIMIT {
        return Err("Missing or oversized manifest".into());
    }
    let mut bytes = Vec::new();
    copy_hash(
        &mut zip.by_name("manifest.json")?,
        &mut bytes,
        MANIFEST_LIMIT,
    )?;
    let manifest: Manifest = serde_json::from_slice(&bytes)?;
    if manifest.format != FORMAT
        || manifest.version != VERSION
        || !valid_hash(&manifest.database.sha256)
        || names.len() != manifest.objects.len() + 2
    {
        return Err("Unsupported portable format or incomplete inventory".into());
    }
    let mut expected = BTreeMap::from([("library.sqlite".to_owned(), manifest.database.clone())]);
    for (hash, bytes) in &manifest.objects {
        if !valid_hash(hash) {
            return Err("Invalid object path".into());
        }
        expected.insert(
            format!("objects/{hash}"),
            FileDigest {
                sha256: hash.clone(),
                bytes: *bytes,
            },
        );
    }
    fs::create_dir(directory.path().join("objects"))?;
    for (name, digest) in expected {
        if names.get(&name) != Some(&digest.bytes) {
            return Err("Missing file or incorrect entry length".into());
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(directory.path().join(&name))?;
        if copy_hash(&mut zip.by_name(&name)?, &mut file, digest.bytes)? != digest {
            return Err("Portable file checksum mismatch".into());
        }
        file.sync_all()?;
    }
    let repo = Repository::open(&directory.path().join("library.sqlite"))?;
    if required(&repo, &directory.path().join("objects"), limits)? != manifest.objects
        || repo.revision_info()? != manifest.state
        || repo
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))?
            != manifest.database_schema
    {
        return Err("Snapshot revision or required files differ from manifest".into());
    }
    drop(repo);
    drop(zip);
    fs::remove_file(package)?; // Only our disposable verification copy, never user recovery data.
    Ok(Verified {
        directory,
        manifest,
        fingerprint,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Session {
    pub version: u32,
    pub library: String,
    pub master: PathBuf,
    pub base_fingerprint: FileDigest,
    pub base_revision: String,
    pub copy: String,
}
#[derive(Debug, Clone)]
pub struct WorkingCopy {
    pub session: Session,
    pub directory: PathBuf,
    pub unpublished: bool,
}
impl WorkingCopy {
    pub fn database(&self) -> PathBuf {
        self.directory.join("library.sqlite")
    }
    pub fn objects(&self) -> PathBuf {
        self.directory.join("objects")
    }
}
/// One lock for this local store, retained across local editing. No shared/cloud locks.
/// New generations are immutable activations; old copies are retained without automatic pruning.
pub struct WorkingStore {
    root: PathBuf,
    _lock: File,
    limits: Limits,
}
impl WorkingStore {
    pub fn open(root: &Path, limits: Limits) -> Result<Self> {
        fs::create_dir_all(root)?;
        let root = root.canonicalize()?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("writer.lock"))?;
        lock.try_lock_exclusive()
            .map_err(|_| "Another process owns this local working store")?;
        fs::create_dir_all(root.join("copies"))?;
        fs::create_dir_all(root.join("staging"))?;
        fs::create_dir_all(root.join("sessions"))?;
        Ok(Self {
            root,
            _lock: lock,
            limits,
        })
    }
    fn record_path(&self, library: &str) -> Result<PathBuf> {
        Uuid::parse_str(library)?;
        Ok(self.root.join("sessions").join(format!("{library}.json")))
    }
    /// Works even when the original master is missing/offline. Never repairs corrupt local data.
    pub fn recover(&self, library: &str) -> Result<Option<WorkingCopy>> {
        let Some(session) = self.session(library)? else { return Ok(None); };
        let directory = self.root.join("copies").join(&session.copy);
        let repo = Repository::open(&directory.join("library.sqlite"))?;
        required(&repo, &directory.join("objects"), self.limits)?;
        let (id, revision) = repo.identity()?;
        if id != library {
            return Err("Local library identity mismatch".into());
        }
        let base_exists = repo
            .conn
            .prepare("SELECT 1 FROM commits WHERE id=?")?
            .exists([&session.base_revision])?;
        if !base_exists {
            return Err("Local base revision missing; retained for recovery".into());
        }
        let unpublished = revision.as_deref() != Some(&session.base_revision);
        Ok(Some(WorkingCopy {
            session,
            directory,
            unpublished,
        }))
    }
    /// Verify before activation. Dirty local work wins over an unchanged master; a changed master
    /// blocks activation. A known stale/divergent master cannot silently replace a clean copy.
    pub fn load(&self, master: &Path) -> Result<WorkingCopy> {
        drop(regular(master)?);
        let master = master.canonicalize()?;
        if master.starts_with(&self.root) {
            return Err("Master must be separate from local working storage".into());
        }
        let verified = verify(&master, &self.root.join("staging"), self.limits)?;
        let library = verified.manifest.state["library"]
            .as_str()
            .ok_or("Missing library identity")?;
        self.record_path(library)?;
        self.reconcile_publication(library)?;
        if let Some(old) = self.recover(library)? {
            if old.session.base_fingerprint == verified.fingerprint {
                let mut old = old;
                if old.session.master != master {
                    if fingerprint(&master, self.limits.bytes)? != verified.fingerprint {
                        return Err("Master changed before reconnecting; retry".into());
                    }
                    old.session.master = master;
                    self.write_session(&old.session)?;
                }
                return Ok(old);
            }
            if old.unpublished {
                return Err(
                    "Master changed and local edits are unpublished; recover local work or Save As"
                        .into(),
                );
            }
            let new_repo = Repository::open(&verified.database())?;
            let old_repo = Repository::open(&old.database())?;
            if !new_repo.descends_from(&old_repo)? {
                return Err("Stale or divergent master; local working copy retained".into());
            }
        }
        // A crash after staging but before catalog activation may leave a recoverable generation.
        // Never silently activate a master over edits in an unregistered local copy.
        if !self.record_path(library)?.exists()
            && self
                .recovery_copies()?
                .iter()
                .any(|c| c.session.library == library && c.unpublished)
        {
            return Err(
                "Unregistered local edits found; inspect recovery copies before loading".into(),
            );
        }
        // A second check closes the long verification window. No claim of cross-device CAS.
        if fingerprint(&master, self.limits.bytes)? != verified.fingerprint {
            return Err("Master changed before activation; retry".into());
        }
        let session = Session {
            version: VERSION,
            library: library.into(),
            master,
            base_fingerprint: verified.fingerprint.clone(),
            base_revision: verified.manifest.state["revision"]
                .as_str()
                .ok_or("Missing revision")?
                .into(),
            copy: Uuid::new_v4().to_string(),
        };
        let directory = self.root.join("copies").join(&session.copy);
        let mut receipt = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(verified.directory.path().join("session.json"))?;
        receipt.write_all(&canonical(&serde_json::to_value(&session)?))?;
        receipt.sync_all()?;
        drop(receipt);
        sync_dir(&verified.objects())?;
        sync_dir(verified.directory.path())?;
        // Preserve a fully verified generation even if activation is interrupted afterwards.
        fs::rename(verified.directory.path(), &directory)?;
        sync_dir(&self.root.join("copies"))?;
        self.write_session(&session)?;
        Ok(WorkingCopy {
            session,
            directory,
            unpublished: false,
        })
    }
    fn write_session(&self, session: &Session) -> Result<()> {
        let record = self.record_path(&session.library)?;
        let mut pending = NamedTempFile::new_in(self.root.join("sessions"))?;
        pending.write_all(&canonical(&serde_json::to_value(&session)?))?;
        pending.as_file().sync_all()?;
        pending.persist(&record).map_err(|e| e.error)?;
        sync_dir(&self.root.join("sessions"))?;
        Ok(())
    }
    /// Strict enumeration is retained for activation: unreadable receipts may conceal edits.
    pub fn recovery_copies(&self) -> Result<Vec<WorkingCopy>> {
        let report = self.recovery_report()?;
        if !report.issues.is_empty() {
            return Err("Some retained recovery copies cannot be verified; inspect local recovery before activation".into());
        }
        Ok(report.copies)
    }
    /// Read-only partial inventory for explicit recovery. Invalid entries remain untouched.
    pub fn recovery_report(&self) -> Result<RecoveryReport> {
        let mut report = RecoveryReport { copies: Vec::new(), issues: Vec::new() };
        for entry in fs::read_dir(self.root.join("copies"))? {
            let entry = entry?;
            let directory = entry.path();
            match self.recovery_copy(&directory) {
                Ok(copy) => report.copies.push(copy),
                Err(error) => {
                    report.issues.push(RecoveryIssue {
                        copy: entry.file_name().to_string_lossy().into_owned(),
                        error: error.to_string(),
                    });
                    // A damaged active pointer must not hide independently verified data.
                    // Keep the warning: automatic activation still refuses this report.
                    if let Ok(copy) = self.recovery_copy_with_session(&directory, false) {
                        if self.session(&copy.session.library).is_err() {
                            report.copies.push(copy);
                        }
                    }
                },
            }
        }
        Ok(report)
    }
    pub(super) fn recovery_copy(&self, directory: &Path) -> Result<WorkingCopy> {
        self.recovery_copy_with_session(directory, true)
    }
    fn recovery_copy_with_session(&self, directory: &Path, prefer_active: bool) -> Result<WorkingCopy> {
        if fs::symlink_metadata(directory)?.file_type().is_symlink() {
            return Err("Recovery directory must not be a symbolic link".into());
        }
        let mut session: Session = serde_json::from_slice(&fs::read(directory.join("session.json"))?)?;
        if session.version != VERSION || directory.file_name().and_then(|s| s.to_str()) != Some(&session.copy) {
            return Err("Invalid recovery receipt; local data retained".into());
        }
        Uuid::parse_str(&session.copy)?;
        Uuid::parse_str(&session.library)?;
        if prefer_active {
            if let Some(active) = self.session(&session.library)? {
                if active.copy == session.copy { session = active; }
            }
        }
        let repo = Repository::open(&directory.join("library.sqlite"))?;
        required(&repo, &directory.join("objects"), self.limits)?;
        let (id, head) = repo.identity()?;
        if id != session.library { return Err("Recovery library identity mismatch".into()); }
        if !repo.conn.prepare("SELECT 1 FROM commits WHERE id=?")?.exists([&session.base_revision])? {
            return Err("Recovery base revision missing; local data retained".into());
        }
        Ok(WorkingCopy { unpublished: head.as_deref() != Some(&session.base_revision), session, directory: directory.to_owned() })
    }
}

pub struct RecoveryReport {
    pub copies: Vec<WorkingCopy>,
    pub issues: Vec<RecoveryIssue>,
}
#[derive(Serialize)]
pub struct RecoveryIssue {
    pub copy: String,
    pub error: String,
}
