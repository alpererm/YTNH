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

/// Takes a backup copy (at most one per 5 minutes unless forced), then thins out old copies and
/// the images only they needed.
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
    // Thinning old copies must never block saving; a failure leaves extra copies behind.
    if prune_backups(folder, now_ms()).is_ok_and(|removed| removed > 0) {
        let _ = prune_backup_objects(folder, Duration::from_secs(3600));
    }
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

const DAY_MS: u64 = 86_400_000;

/// Milliseconds since 1970 from a backup file name `{stamp:016}-{uuid}.sqlite`.
/// Any other name returns None and is never touched by pruning.
fn backup_stamp(name: &str) -> Option<u64> {
    let rest = name.strip_suffix(".sqlite")?;
    let (stamp, id) = rest.split_once('-')?;
    if stamp.len() != 16 || !stamp.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Uuid::parse_str(id).ok()?;
    stamp.parse().ok()
}

/// Calendar month (year * 12 + month) of a day count since 1970 (UTC).
fn month_of_day(day: u64) -> u64 {
    // Howard Hinnant's days-to-civil algorithm.
    let z = day as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (year * 12 + month - 1) as u64
}

/// Which backups to delete, given (name, stamp) pairs and the current time.
/// Keeps every copy from the last 24 hours, the newest copy per day for 30 days,
/// per week for 26 weeks, and per month after that. The newest copy is always kept.
pub fn backups_to_prune(copies: &[(String, u64)], now: u64) -> Vec<String> {
    let mut sorted: Vec<&(String, u64)> = copies.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    let mut seen = std::collections::HashSet::new();
    let mut remove = Vec::new();
    for (index, (name, stamp)) in sorted.iter().enumerate() {
        let age = now.saturating_sub(*stamp);
        let day = stamp / DAY_MS;
        let bucket = if index == 0 || age < DAY_MS {
            continue;
        } else if age < 30 * DAY_MS {
            ("day", day)
        } else if age < 26 * 7 * DAY_MS {
            ("week", (day + 3) / 7)
        } else {
            ("month", month_of_day(day))
        };
        // Copies are visited newest first, so the first one in a bucket is kept.
        if !seen.insert(bucket) {
            remove.push(name.clone());
        }
    }
    remove
}

/// Deletes thinned-out backup copies in `folder`. Their image objects are removed separately
/// by `prune_backup_objects`.
pub fn prune_backups(folder: &Path, now: u64) -> Result<usize> {
    let mut copies = Vec::new();
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(stamp) = backup_stamp(&name) {
            copies.push((name, stamp));
        }
    }
    let remove = backups_to_prune(&copies, now);
    for name in &remove {
        fs::remove_file(folder.join(name))?;
    }
    Ok(remove.len())
}

/// Deletes image and archive files in `folder/objects` that no remaining backup copy needs.
/// Nothing is deleted unless every `.sqlite` copy in `folder` can be read; only content-addressed
/// names are considered, and files changed within `min_age` are kept (a backup may be in progress).
/// Restoring a backup also looks in the library's own image store, so this never breaks a restore.
pub fn prune_backup_objects(folder: &Path, min_age: Duration) -> Result<usize> {
    let objects = folder.join("objects");
    if !objects.is_dir() {
        return Ok(0);
    }
    let mut needed = std::collections::HashSet::new();
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        if !entry.file_type()?.is_file() || path.extension().and_then(|s| s.to_str()) != Some("sqlite") {
            continue;
        }
        let repo = Repository::open(&path)?;
        needed.extend(crate::images::required(&repo, &objects)?.into_keys());
        needed.extend(repo.inventory()?.into_values().map(|(hash, _)| hash));
    }
    let mut removed = 0;
    for entry in fs::read_dir(&objects)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let content_addressed = name.len() == 64 && name.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if !content_addressed || needed.contains(&name) || !entry.file_type()?.is_file() {
            continue;
        }
        let age = entry.metadata()?.modified()?.elapsed().unwrap_or_default();
        if age < min_age {
            continue;
        }
        fs::remove_file(entry.path())?;
        removed += 1;
    }
    Ok(removed)
}

/// Earlier versions of one item, read from the automatic backups in `folder` (newest first).
/// Each backup is opened read-only and queried for that item only; consecutive copies with
/// the same title, text, status and archived state are reported once (the newest of them).
pub fn item_history(folder: &Path, item: &str, limit: usize) -> Result<Vec<serde_json::Value>> {
    use rusqlite::{Connection, OpenFlags, OptionalExtension};
    let mut copies = Vec::new();
    if folder.is_dir() {
        for entry in fs::read_dir(folder)? {
            let name = entry?.file_name().to_string_lossy().to_string();
            if let Some(stamp) = backup_stamp(&name) {
                copies.push((stamp, name));
            }
        }
    }
    copies.sort_by(|a, b| b.cmp(a));
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut last: Option<(String, String, String, bool)> = None;
    for (stamp, name) in copies {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let Ok(conn) = Connection::open_with_flags(folder.join(&name), flags) else { continue };
        let row = conn
            .query_row(
                "SELECT title,body,status,updated,archived FROM items WHERE id=?1",
                [item],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, bool>(4)?)),
            )
            .optional();
        let Ok(Some((title, content, status, updated, archived))) = row else { continue };
        let key = (title.clone(), content.clone(), status.clone(), archived);
        if last.as_ref() == Some(&key) {
            continue;
        }
        last = Some(key);
        out.push(serde_json::json!({
            "backup": name, "savedAt": stamp, "title": title, "content": content,
            "status": status, "updatedAt": updated, "archived": archived
        }));
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod pruning {
    use super::*;

    fn copy(stamp: u64) -> (String, u64) {
        (format!("{stamp:016}-{}.sqlite", Uuid::new_v4()), stamp)
    }

    #[test]
    fn keeps_recent_then_daily_weekly_and_monthly_copies() {
        let now = 1_800_000_000_000u64; // 2027-01-15
        let mut copies = Vec::new();
        // One copy every 5 minutes for 400 days.
        let mut t = now - 400 * DAY_MS;
        while t <= now {
            copies.push(copy(t));
            t += 5 * 60_000;
        }
        let remove: std::collections::HashSet<_> = backups_to_prune(&copies, now).into_iter().collect();
        let kept: Vec<u64> = copies.iter().filter(|c| !remove.contains(&c.0)).map(|c| c.1).collect();
        let recent = kept.iter().filter(|s| now - **s < DAY_MS).count();
        assert_eq!(recent, copies.iter().filter(|c| now - c.1 < DAY_MS).count(), "all of the last 24 hours");
        let days: std::collections::HashSet<_> = kept.iter().filter(|s| (DAY_MS..30 * DAY_MS).contains(&(now - **s))).map(|s| s / DAY_MS).collect();
        assert_eq!(days.len(), kept.iter().filter(|s| (DAY_MS..30 * DAY_MS).contains(&(now - **s))).count(), "one per day");
        assert!(days.len() >= 29);
        assert!(kept.len() < 24 * 12 + 30 + 26 + 14, "bounded: {} kept", kept.len());
        assert!(kept.contains(&copies.iter().map(|c| c.1).max().unwrap()), "newest kept");
    }

    #[test]
    fn only_backup_files_are_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let now = 1_800_000_000_000u64;
        let old_a = copy(now - 100 * DAY_MS);
        let old_b = copy(now - 100 * DAY_MS + 60_000);
        let newest = copy(now - 1000);
        for (name, _) in [&old_a, &old_b, &newest] {
            fs::write(dir.path().join(name), b"x").unwrap();
        }
        fs::write(dir.path().join("notes.txt"), b"keep").unwrap();
        fs::write(dir.path().join("0000000000000001-not-a-uuid.sqlite"), b"keep").unwrap();
        fs::create_dir(dir.path().join("objects")).unwrap();
        assert_eq!(prune_backups(dir.path(), now).unwrap(), 1);
        assert!(!dir.path().join(&old_a.0).exists(), "older copy in the same week is removed");
        assert!(dir.path().join(&old_b.0).exists() && dir.path().join(&newest.0).exists());
        assert!(dir.path().join("notes.txt").exists() && dir.path().join("0000000000000001-not-a-uuid.sqlite").exists());
        assert!(dir.path().join("objects").is_dir());
    }

    #[test]
    fn item_history_reads_versions_from_backups() {
        let dir = tempfile::tempdir().unwrap();
        let make = |stamp: u64, title: &str| {
            let path = dir.path().join(format!("{stamp:016}-{}.sqlite", Uuid::new_v4()));
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE items(id TEXT PRIMARY KEY,kind TEXT,title TEXT,body TEXT,status TEXT,created TEXT,updated TEXT,archived INTEGER,sequence INTEGER,extras TEXT)").unwrap();
            c.execute("INSERT INTO items VALUES('a','Note',?1,'text','Todo','c','u',0,1,'{}')", [title]).unwrap();
        };
        make(1_000, "First");
        make(2_000, "Second");
        make(3_000, "Second"); // unchanged: reported once
        fs::write(dir.path().join("notes.txt"), b"x").unwrap();
        let h = item_history(dir.path(), "a", 50).unwrap();
        let titles: Vec<_> = h.iter().map(|v| v["title"].as_str().unwrap().to_owned()).collect();
        assert_eq!(titles, ["Second", "First"]);
        assert_eq!(h[0]["savedAt"], 3_000);
        assert!(item_history(dir.path(), "missing", 50).unwrap().is_empty());
        assert!(item_history(&dir.path().join("none"), "a", 50).unwrap().is_empty());
    }

    #[test]
    fn month_buckets_follow_the_calendar() {
        assert_eq!(month_of_day(0), 1970 * 12);           // 1970-01-01
        assert_eq!(month_of_day(31), 1970 * 12 + 1);      // 1970-02-01
        assert_eq!(month_of_day(20_454), 2026 * 12);      // 2026-01-01
        assert_eq!(month_of_day(20_453), 2025 * 12 + 11); // 2025-12-31
    }
}
