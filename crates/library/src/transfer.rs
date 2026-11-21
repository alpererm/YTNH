//! Immutable archive objects and revision verification. No provider or OS paths are assumed.
use super::{array, digest, object, string, Repository, Result, V};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn safe_leaf(name: &str) -> Result<()> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|c| c.is_control() || "/\\:<>|\"?*".contains(c))
        || name.ends_with(['.', ' '])
    {
        return Err("Unsafe external filename".into());
    }
    Ok(())
}
fn hash_name(s: &str) -> Result<()> {
    if s.len() != 64
        || !s
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    {
        return Err("Invalid object digest".into());
    }
    Ok(())
}
pub fn immutable(path: &Path, bytes: &[u8]) -> Result<()> {
    fs::create_dir_all(path.parent().ok_or("Missing directory")?)?;
    if path.exists() {
        if fs::read(path)? == bytes {
            return Ok(());
        }
        return Err("An immutable file already exists with different content".into());
    }
    let mut tmp = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    if digest(&fs::read(tmp.path())?) != digest(bytes) {
        return Err("Backup verification failed".into());
    }
    match tmp.persist_noclobber(path) {
        Ok(_) => Ok(()),
        Err(e)
            if e.error.kind() == std::io::ErrorKind::AlreadyExists && fs::read(path)? == bytes =>
        {
            Ok(())
        }
        Err(e) => Err(e.error.into()),
    }
}
pub fn archive_names(model: &V) -> Result<BTreeMap<String, String>> {
    let mut names = BTreeMap::new();
    let mut used = BTreeMap::new();
    for entry in array(&model["archiveIndex"])? {
        let name = string(&entry["archiveFile"])?;
        safe_leaf(name)?;
        let id = entry["archiveId"].as_str().unwrap_or(name);
        if names
            .insert(id.to_owned(), name.to_owned())
            .is_some_and(|n| n != name)
            || used
                .insert(name.to_lowercase(), id)
                .is_some_and(|other| other != id)
        {
            return Err("Ambiguous cold archive filename or identity".into());
        }
    }
    Ok(names)
}
pub fn verify_archive(model: &V, id: &str, bytes: &[u8]) -> Result<()> {
    let a: V = serde_json::from_slice(bytes)?;
    if a["format"] != "local-notes-todos-cold-archive" || a["schemaVersion"] != 1 {
        return Err("Unrecognized cold archive".into());
    }
    let items = array(&a["items"])?;
    if a["itemCount"].as_u64() != Some(items.len() as u64) {
        return Err("Archive count mismatch".into());
    }
    let mut by_id = BTreeMap::new();
    for i in items {
        let key = string(&i["id"])?;
        if key.is_empty()
            || key.len() > 160
            || !key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err("Invalid archive item identity".into());
        }
        for field in ["content", "title", "createdAt", "updatedAt"] {
            string(&i[field])?;
        }
        if !matches!(i["type"].as_str(), Some("Note" | "Todo"))
            || i["archived"].as_bool().is_none()
            || !i["order"].as_i64().is_some_and(|n| n > 0)
            || !matches!(
                i["status"].as_str(),
                Some("Done" | "Cancelled" | "Todo" | "Waiting for" | "On hold")
            )
        {
            return Err("Invalid archived item fields".into());
        }
        for field in ["scheduledDates", "explicitTags", "codeAliases"] {
            for value in array(&i[field])? {
                string(value)?;
            }
        }
        object(&i["occurrenceStates"])?;
        if by_id.insert(key, i).is_some() {
            return Err("Duplicate archived item".into());
        }
    }
    if a.get("sourceDatabaseCreatedAt")
        .is_some_and(|v| !v.is_null() && v != &model["createdAt"])
    {
        return Err("Archive belongs to a different library".into());
    }
    for item in items {
        let mut node = item;
        let mut seen = BTreeSet::new();
        loop {
            if !seen.insert(string(&node["id"])?) || seen.len() > 256 {
                return Err("Invalid archive hierarchy".into());
            }
            if node["parentId"].is_null() {
                break;
            }
            let Some(parent) = by_id.get(string(&node["parentId"])?) else {
                break;
            };
            node = parent;
        }
    }
    let mut found = false;
    for e in array(&model["archiveIndex"])? {
        if e["archiveId"]
            .as_str()
            .unwrap_or(string(&e["archiveFile"])?)
            != id
        {
            continue;
        }
        found = true;
        if e.get("archiveId")
            .is_some_and(|k| !k.is_null() && *k != a["archiveId"])
        {
            return Err("Archive identifier mismatch".into());
        }
        let key = string(&e["id"])?;
        let item = by_id.get(key).ok_or("Missing archived item")?;
        for field in ["createdAt", "updatedAt", "codeAliases"] {
            if e.get(field).is_some() && e[field] != item[field] {
                return Err("Archive metadata mismatch".into());
            }
        }
        if e.get("tags").is_some() && e["tags"] != item["explicitTags"] {
            return Err("Archived tags disagree with the index".into());
        }
        if e["code"] != a["codes"][key]
            || e["title"] != item["title"]
            || e["type"] != item["type"]
            || e["parentId"] != item["parentId"]
        {
            return Err("Archive content does not match its index".into());
        }
    }
    if !found {
        return Err("Unreferenced cold archive".into());
    }
    Ok(())
}
pub type Inventory = BTreeMap<String, (String, u64)>;
pub fn stage_archives(
    model: &V,
    source: &Path,
    vault: &Path,
    known: &Inventory,
) -> Result<Inventory> {
    let mut result = Inventory::new();
    for (id, name) in archive_names(model)? {
        let bytes = if let Some((hash, _)) = known.get(&id) {
            hash_name(hash)?;
            let b = fs::read(vault.join(hash))?;
            if digest(&b) != *hash {
                return Err("Managed archive checksum mismatch".into());
            }
            b
        } else {
            fs::read(source.join(&name))
                .map_err(|e| format!("Locate the cold archive {name} and retry: {e}"))?
        };
        verify_archive(model, &id, &bytes)?;
        let hash = digest(&bytes);
        immutable(&vault.join(&hash), &bytes)?;
        result.insert(id, (hash, bytes.len() as u64));
    }
    Ok(result)
}
impl Repository {
    pub fn inventory(&self) -> Result<Inventory> {
        Ok(self
            .conn
            .prepare("SELECT id,digest,bytes FROM files WHERE kind='archive'")?
            .query_map([], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub(crate) fn revision_info(&self) -> Result<V> {
        let (library, head) = self.identity()?;
        let head = head.ok_or("Empty library")?;
        let (parent, generation, hash): (Option<String>, i64, String) = self.conn.query_row(
            "SELECT parent,generation,model_hash FROM commits WHERE id=?",
            [&head],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        Ok(
            json!({"library":library,"revision":head,"parent":parent,"generation":generation,"content":hash}),
        )
    }
    pub fn descends_from(&self, local: &Repository) -> Result<bool> {
        let (a, new) = self.identity()?;
        let (b, old) = local.identity()?;
        if a != b {
            return Ok(false);
        }
        let mut cursor = new;
        let mut seen = BTreeSet::new();
        while let Some(id) = cursor {
            if !seen.insert(id.clone()) {
                return Err("Malformed revision ancestry".into());
            }
            let remote: (Option<String>, String, i64) = self.conn.query_row(
                "SELECT parent,model_hash,generation FROM commits WHERE id=?",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;
            if old.as_deref() == Some(&id) {
                let same: (Option<String>, String, i64) = local.conn.query_row(
                    "SELECT parent,model_hash,generation FROM commits WHERE id=?",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )?;
                return Ok(remote == same);
            }
            cursor = remote.0;
        }
        Ok(false)
    }
}
#[cfg(test)]
mod safety_tests {
    use super::*;
    #[test]
    fn wrong_library_and_damaged_archive_are_rejected() {
        let model: V =
            serde_json::from_str(include_str!("../tests/fixtures/library.json")).unwrap();
        let mut archive: V =
            serde_json::from_str(include_str!("../tests/fixtures/cold-archive.json")).unwrap();
        archive["archiveId"] = json!("unrelated");
        assert!(verify_archive(&model, "archive-id-1", archive.to_string().as_bytes()).is_err());
        for path in [
            "../archive.json",
            "C:\\outside.json",
            "/root/old.json",
            "a/b.json",
        ] {
            assert!(safe_leaf(path).is_err())
        }
    }
}
