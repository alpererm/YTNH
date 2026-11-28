//! Keeping no more local data than recovery needs. A library's working copy is removed once
//! everything in it is in the library file; copies with unsaved work are never removed here.
use super::*;

impl WorkingStore {
    /// After a clean save: removes this library's working copy, session and finished save
    /// attempts. Returns false (and removes nothing) while the copy has work that isn't in the
    /// library file yet, or a save whose outcome isn't known.
    pub fn close(&self, library: &str) -> Result<bool> {
        self.record_path(library)?;
        self.reconcile_publication(library)?;
        let Some(working) = self.recover(library)? else {
            return Ok(true);
        };
        if working.unpublished || self.publication_unfinished(library)? {
            return Ok(false);
        }
        self.remove_session(library)?;
        remove_tree(&working.directory)?;
        sync_dir(&self.root.join("copies"))?;
        self.remove_publications(Some(library))?;
        Ok(true)
    }

    /// "Forget this library on this computer": removes every working copy, session and save
    /// attempt of this library. Refused while a copy holds unsaved work, unless `discard` is set.
    pub fn forget(&self, library: &str, discard: bool) -> Result<usize> {
        self.record_path(library)?;
        let _ = self.reconcile_publication(library);
        let mut copies = Vec::new();
        for entry in fs::read_dir(self.root.join("copies"))? {
            let directory = entry?.path();
            match self.recovery_copy_with_session(&directory, false) {
                Ok(copy) if copy.session.library == library => copies.push(copy),
                _ => {},
            }
        }
        if !discard {
            let active = self.recover(library).ok().flatten();
            if active.as_ref().is_some_and(|a| a.unpublished)
                || copies.iter().any(|c| c.unpublished && !self.preserved_elsewhere(c))
            {
                return Err("This library has local edits that aren't in the library file yet. Save them first, or choose to discard them.".into());
            }
        }
        self.remove_session(library)?;
        for copy in &copies {
            remove_tree(&copy.directory)?;
        }
        sync_dir(&self.root.join("copies"))?;
        self.remove_publications(Some(library))?;
        Ok(copies.len())
    }

    /// Explicit "Discard" in Recover Unsaved Copy: removes one kept copy, unsaved work included.
    /// When it is its library's active copy, the library reopens from its file next time.
    /// Returns the library it belonged to.
    pub fn discard_copy(&self, copy_id: &str) -> Result<String> {
        Uuid::parse_str(copy_id)?;
        let directory = self.root.join("copies").join(copy_id);
        let copy = self.recovery_copy_with_session(&directory, false)?;
        let library = copy.session.library.clone();
        if self.session(&library).ok().flatten().is_some_and(|s| s.copy == copy_id) {
            self.remove_session(&library)?;
            self.remove_publications(Some(&library))?;
        }
        remove_tree(&directory)?;
        sync_dir(&self.root.join("copies"))?;
        Ok(library)
    }

    /// Removes working copies that nothing needs: earlier generations whose content is in the
    /// active copy, and copies of closed libraries that hold nothing beyond their library file.
    /// Unreadable copies and copies with unsaved work are kept for explicit recovery.
    pub fn prune(&self) -> Result<usize> {
        let mut removed = 0;
        for entry in fs::read_dir(self.root.join("copies"))? {
            let directory = entry?.path();
            let Ok(copy) = self.recovery_copy_with_session(&directory, false) else { continue };
            let active = match self.session(&copy.session.library) {
                Ok(active) => active,
                Err(_) => continue, // A damaged pointer: keep everything for explicit recovery.
            };
            if active.as_ref().is_some_and(|a| a.copy == copy.session.copy) {
                continue;
            }
            if !copy.unpublished || self.preserved_elsewhere(&copy) {
                remove_tree(&directory)?;
                removed += 1;
            }
        }
        if removed > 0 {
            sync_dir(&self.root.join("copies"))?;
        }
        self.remove_publications(None)?;
        Ok(removed)
    }

    /// True when the copy's latest revision is part of the library's active working copy, so
    /// its edits survive there.
    fn preserved_elsewhere(&self, copy: &WorkingCopy) -> bool {
        let Ok(Some(active)) = self.session(&copy.session.library) else { return false };
        if active.copy == copy.session.copy {
            return false;
        }
        let head = Repository::open(&copy.database()).ok().and_then(|r| r.identity().ok()).and_then(|x| x.1);
        let Some(head) = head else { return false };
        let database = self.root.join("copies").join(&active.copy).join("library.sqlite");
        Repository::open(&database)
            .and_then(|r| Ok(r.conn.prepare("SELECT 1 FROM commits WHERE id=?")?.exists([&head])?))
            .unwrap_or(false)
    }

    fn publication_unfinished(&self, library: &str) -> Result<bool> {
        let Some(session) = self.session(library)? else { return Ok(false) };
        let bytes = match fs::read(self.publication_path(library)?) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.into()),
        };
        let publication: V = serde_json::from_slice(&bytes)?;
        Ok(publication["previous"] == serde_json::to_value(&session)?)
    }

    fn remove_session(&self, library: &str) -> Result<()> {
        for path in [self.publication_path(library)?, self.record_path(library)?] {
            match fs::remove_file(&path) {
                Ok(()) => {},
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
                Err(e) => return Err(e.into()),
            }
        }
        sync_dir(&self.root.join("sessions"))
    }

    /// Removes finished save attempts (the packaged file and the copy of the file it replaced).
    /// An attempt is finished when its library's session no longer starts from it; attempts that
    /// can't be read, or that a pending save still refers to, are kept.
    pub(super) fn remove_publications(&self, only: Option<&str>) -> Result<()> {
        let folder = self.root.join("publications");
        let Ok(entries) = fs::read_dir(&folder) else { return Ok(()) };
        let mut removed = false;
        for entry in entries {
            let directory = entry?.path();
            let Ok(bytes) = fs::read(directory.join("publication.json")) else { continue };
            let Ok(publication) = serde_json::from_slice::<V>(&bytes) else { continue };
            let Some(library) = publication["previous"]["library"].as_str() else { continue };
            if only.is_some_and(|l| l != library) || Uuid::parse_str(library).is_err() {
                continue;
            }
            let pending = fs::read(self.publication_path(library)?).ok();
            if pending.as_deref() == Some(&bytes[..]) {
                match self.session(library) {
                    Ok(Some(session)) if publication["previous"] == serde_json::to_value(&session)? => continue,
                    Ok(_) => {},
                    Err(_) => continue,
                }
            }
            remove_tree(&directory)?;
            removed = true;
        }
        if removed {
            sync_dir(&folder)?;
        }
        Ok(())
    }
}

/// Removes a directory this store created. Refuses symbolic links, so nothing outside is touched.
fn remove_tree(directory: &Path) -> Result<()> {
    match fs::symlink_metadata(directory) {
        Ok(meta) if meta.file_type().is_symlink() => Err("Refusing to remove a symbolic link".into()),
        Ok(_) => Ok(fs::remove_dir_all(directory)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fixture() -> (TempDir, WorkingStore, WorkingCopy) {
        let dir = tempfile::tempdir().unwrap();
        let mut model: V = serde_json::from_slice(include_bytes!("../../tests/fixtures/library.json")).unwrap();
        model["archiveIndex"] = json!([]);
        let mut repo = Repository::create(&dir.path().join("source.sqlite"), &Uuid::new_v4().to_string(), None).unwrap();
        repo.save(&model, None, "fixture").unwrap();
        let master = dir.path().join("Library.ytnh");
        create(&repo, &dir.path().join("objects"), &master, dir.path(), Limits::default()).unwrap();
        let store = WorkingStore::open(&dir.path().join("local"), Limits::default()).unwrap();
        let copy = store.load(&master).unwrap();
        (dir, store, copy)
    }
    fn edit(copy: &WorkingCopy, title: &str) -> String {
        let mut repo = Repository::open(&copy.database()).unwrap();
        let mut model = repo.load().unwrap();
        model["items"][0]["title"] = json!(title);
        repo.save(&model, repo.identity().unwrap().1.as_deref(), "fixture").unwrap()
    }
    fn count(dir: &Path) -> usize {
        fs::read_dir(dir).map(|e| e.count()).unwrap_or(0)
    }

    #[test]
    fn close_removes_a_saved_copy_and_keeps_unsaved_work() {
        let (_dir, store, copy) = fixture();
        let library = copy.session.library.clone();
        // Unsaved edits are never removed.
        let revision = edit(&copy, "Not saved yet");
        assert!(!store.close(&library).unwrap());
        assert!(copy.directory.exists());
        assert_eq!(store.recovery_report().unwrap().copies.len(), 1);
        // After saving, closing leaves nothing of this library behind.
        store.publish(&library, &revision, None).unwrap();
        assert!(store.close(&library).unwrap());
        assert!(!copy.directory.exists());
        assert!(store.session(&library).unwrap().is_none());
        assert_eq!(store.recovery_report().unwrap().copies.len(), 0);
        assert_eq!(count(&store.root.join("publications")), 0);
        // Opening again starts from the library file, with the saved edit.
        let reopened = store.load(&copy.session.master).unwrap();
        assert!(!reopened.unpublished);
        assert_eq!(Repository::open(&reopened.database()).unwrap().load().unwrap()["items"][0]["title"], "Not saved yet");
    }

    #[test]
    fn a_finished_save_leaves_no_package_or_previous_file_behind() {
        let (_dir, store, copy) = fixture();
        let revision = edit(&copy, "Saved");
        store.publish(&copy.session.library, &revision, None).unwrap();
        assert_eq!(count(&store.root.join("publications")), 0);
        assert!(!store.publication_path(&copy.session.library).unwrap().exists());
    }

    #[test]
    fn prune_removes_old_generations_and_closed_clean_copies_only() {
        let (dir, store, copy) = fixture();
        let library = copy.session.library.clone();
        // An older generation whose saved edits are in the active copy.
        let revision = edit(&copy, "First");
        store.publish(&library, &revision, None).unwrap();
        // Another computer saves a newer version; opening it here starts a new generation that
        // contains the first copy's saved edit.
        let elsewhere = WorkingStore::open(&dir.path().join("elsewhere"), Limits::default()).unwrap();
        let theirs = elsewhere.load(&copy.session.master).unwrap();
        let newer = edit(&theirs, "From the other computer");
        elsewhere.publish(&library, &newer, None).unwrap();
        let second = store.load(&copy.session.master).unwrap();
        assert_ne!(second.directory, copy.directory);
        assert!(copy.directory.exists(), "load never removes a copy it can't prove is preserved");
        store.prune().unwrap();
        assert!(!copy.directory.exists());
        assert!(second.directory.exists(), "the active copy stays");
        // A copy with unsaved work and no session is kept for explicit recovery.
        edit(&second, "Unsaved");
        fs::remove_file(store.record_path(&library).unwrap()).unwrap();
        store.prune().unwrap();
        assert!(second.directory.exists());
        assert_eq!(store.recovery_report().unwrap().copies.len(), 1);
    }

    #[test]
    fn discarding_a_kept_copy_removes_it_and_its_session() {
        let (_dir, store, copy) = fixture();
        let library = copy.session.library.clone();
        edit(&copy, "Unsaved");
        fs::remove_file(&copy.session.master).unwrap(); // the library file was deleted
        assert_eq!(store.recovery_report().unwrap().copies.len(), 1);
        assert!(store.discard_copy("not-a-copy").is_err());
        assert_eq!(store.discard_copy(&copy.session.copy).unwrap(), library);
        assert!(!copy.directory.exists());
        assert!(store.session(&library).unwrap().is_none());
        assert_eq!(store.recovery_report().unwrap().copies.len(), 0);
    }

    #[test]
    fn forget_requires_saving_or_discarding_local_edits() {
        let (_dir, store, copy) = fixture();
        let library = copy.session.library.clone();
        edit(&copy, "Local only");
        assert!(store.forget(&library, false).is_err());
        assert!(copy.directory.exists());
        assert_eq!(store.forget(&library, true).unwrap(), 1);
        assert!(!copy.directory.exists());
        assert!(store.session(&library).unwrap().is_none());
        assert_eq!(store.recovery_report().unwrap().copies.len(), 0);
        // The library file itself is never touched.
        assert!(copy.session.master.exists());
    }
}
