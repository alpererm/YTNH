//! Staging and recovery operations. Activation is a separate host transaction.
use super::transfer::{archive_names, immutable, verify_archive};
use super::{digest, Repository, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use uuid::Uuid;

pub fn export_recovery(repo: &Repository, vault: &Path, destination: &Path) -> Result<PathBuf> {
    repo.check()?;
    let model = repo.load()?;
    let inv = repo.inventory()?;
    let names = archive_names(&model)?;
    let mut filename = "library.json".to_owned();
    while names.values().any(|n| n.eq_ignore_ascii_case(&filename)) {
        filename = format!("export-{filename}")
    }
    // Write the primary JSON last. A partial recovery export never looks complete.
    for (id, name) in names {
        let (hash, len) = inv.get(&id).ok_or("Missing archive inventory")?;
        let bytes = fs::read(vault.join(hash))?;
        if digest(&bytes) != *hash || bytes.len() as u64 != *len {
            return Err("Damaged managed archive; export stopped".into());
        }
        verify_archive(&model, &id, &bytes)?;
        immutable(&destination.join(name), &bytes)?;
    }
    let images = crate::images::required(repo, vault)?;
    crate::images::export_files(&images, vault, destination)?;
    let path = destination.join(filename);
    immutable(&path, &serde_json::to_vec_pretty(&model)?)?;
    Ok(path)
}

/// Recovery history is retained; there is no automatic snapshot deletion policy.
pub fn backup_retained(repo: &Repository, folder: &Path, vault: &Path, force: bool) -> Result<()> {
    fs::create_dir_all(folder)?;
    let mut copies = Vec::new();
    for entry in fs::read_dir(folder)? {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("sqlite") {
            copies.push(path)
        }
    }
    copies.sort();
    if !force
        && copies
            .last()
            .and_then(|p| fs::metadata(p).ok()?.modified().ok()?.elapsed().ok())
            .is_some_and(|age| age < Duration::from_secs(300))
    {
        return Ok(());
    }
    let stamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)?
        .as_millis();
    let name = format!("{stamp:016}-{}.sqlite", Uuid::new_v4());
    let temp = tempfile::tempdir_in(folder)?;
    let snap = temp.path().join("copy");
    repo.snapshot(&snap)?;
    let snapshot = Repository::open(&snap)?;
    let images = crate::images::required(&snapshot, vault)?;
    // The published database is the completion marker. Auto-backup can wait
    // for delayed originals while local edits continue to save.
    if !crate::images::copy_required(&images, vault, &folder.join("objects"), !force)? {
        return Ok(());
    }
    for (_, (hash, len)) in snapshot.inventory()? {
        let data =
            crate::images::read_original(vault, &hash, len)?.ok_or("Missing backup archive")?;
        immutable(&folder.join("objects").join(hash), &data)?;
    }
    drop(snapshot);
    fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&snap)?
        .sync_all()?;
    fs::rename(snap, folder.join(name))?;
    Ok(())
}
