//! Verified publication and interrupted-publication recovery. No provider-specific behavior.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Publication {
    version: u32,
    previous: Session,
    destination: PathBuf,
    expected: Option<FileDigest>,
    candidate: String,
    fingerprint: FileDigest,
    revision: String,
}
impl WorkingStore {
    /// "Keep both", step 1: reads the library file another computer changed after this copy was
    /// opened. Its image and archive objects are copied into this working copy (content-addressed,
    /// so no existing file changes); the items it changed since the shared revision are listed
    /// (null when the histories are unrelated). Nothing else changes.
    pub fn read_conflict(&self, library: &str) -> Result<V> {
        self.reconcile_publication(library)?;
        let working = self.recover(library)?.ok_or("Unknown portable library")?;
        let verified = verify(&working.session.master, &self.root.join("staging"), self.limits)?;
        if verified.manifest.state["library"].as_str() != Some(library) {
            return Err("The library file now holds a different library; use Save As".into());
        }
        if verified.fingerprint == working.session.base_fingerprint {
            return Err("The library file has not changed; save again".into());
        }
        let repo = Repository::open(&verified.database())?;
        let changed = repo.items_changed_since(&working.session.base_revision)?;
        let objects = working.objects();
        fs::create_dir_all(&objects)?;
        for entry in fs::read_dir(verified.objects())? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str().filter(|n| valid_hash(n)) else { continue };
            let target = objects.join(name);
            if fs::symlink_metadata(&target).is_err() {
                transfer::immutable(&target, &fs::read(entry.path())?)?;
            }
        }
        sync_dir(&objects)?;
        Ok(serde_json::json!({"model": repo.load()?, "changed": changed, "fingerprint": verified.fingerprint}))
    }
    /// "Keep both", step 2, after the other file's changes are saved in this copy: the next save
    /// replaces that file. Refused if it changed again since it was read.
    pub fn adopt_conflict(&self, library: &str, seen: &FileDigest) -> Result<WorkingCopy> {
        self.reconcile_publication(library)?;
        let mut working = self.recover(library)?.ok_or("Unknown portable library")?;
        if fingerprint(&working.session.master, self.limits.bytes)? != *seen {
            return Err("The library file changed again; choose Keep both again".into());
        }
        working.session.base_fingerprint = seen.clone();
        self.write_session(&working.session)?;
        Ok(working)
    }
    pub fn session(&self, library: &str) -> Result<Option<Session>> {
        let bytes = match fs::read(self.record_path(library)?) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let session: Session = serde_json::from_slice(&bytes)?;
        if session.version != VERSION
            || session.library != library
            || !valid_hash(&session.base_fingerprint.sha256)
        {
            return Err("Invalid local session record".into());
        }
        Uuid::parse_str(&session.copy)?;
        Ok(Some(session))
    }
    fn publication_path(&self, library: &str) -> Result<PathBuf> {
        self.record_path(library)?;
        Ok(self
            .root
            .join("sessions")
            .join(format!("{library}.pending.json")))
    }
    /// Called during opening and before saving. An exact successful replacement is recognized
    /// even if the process stopped before updating its local publication state.
    pub fn reconcile_publication(&self, library: &str) -> Result<()> {
        let Some(session) = self.session(library)? else {
            return Ok(());
        };
        let bytes = match fs::read(self.publication_path(library)?) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e.into()),
        };
        let publication: Publication = serde_json::from_slice(&bytes)?;
        if publication.version != VERSION
            || publication.previous.library != library
            || !valid_hash(&publication.fingerprint.sha256)
        {
            return Err("Invalid pending publication; recovery files retained".into());
        }
        if session != publication.previous {
            return Ok(());
        } // Already recorded, or a later explicit activation.
        let visible = match fingerprint(&publication.destination, self.limits.bytes) {
            Ok(value) => value,
            Err(_) => return Ok(()), // Offline/missing is not evidence of a completed save.
        };
        if visible != publication.fingerprint {
            return Ok(());
        }
        let checked = verify(
            &publication.destination,
            &self.root.join("staging"),
            self.limits,
        )?;
        if checked.fingerprint != publication.fingerprint
            || checked.manifest.state["library"] != library
            || checked.manifest.state["revision"] != publication.revision
        {
            return Err("The saved library file couldn't be verified; your local work was kept".into());
        }
        let mut saved = session;
        saved.master = publication.destination;
        saved.base_revision = publication.revision;
        saved.base_fingerprint = publication.fingerprint;
        self.write_session(&saved)
    }
    /// Revalidate the selected file on startup, retaining local edits if it is unchanged.
    pub fn reopen(&self, library: &str) -> Result<WorkingCopy> {
        self.reconcile_publication(library)?;
        let session = self.session(library)?.ok_or("Unknown portable library")?;
        self.load(&session.master)
    }
    /// Explicit user-selected recovery only. Never adopt by timestamp or replace dirty work.
    pub fn adopt_recovery(&self, copy_id: &str) -> Result<WorkingCopy> {
        Uuid::parse_str(copy_id)?;
        // Explicit selection validates only that generation; unrelated damaged receipts
        // must not prevent recovery. Automatic activation still uses strict enumeration.
        let directory = self.root.join("copies").join(copy_id);
        let receipt_copy = self.recovery_copy_with_session(&directory, false)?;
        if self.session(&receipt_copy.session.library).is_err() {
            // Explicit recovery only. Do not guess which of competing retained edits wins.
            for entry in fs::read_dir(self.root.join("copies"))? {
                let other = self.recovery_copy_with_session(&entry?.path(), false)?;
                if other.session.library == receipt_copy.session.library
                    && other.session.copy != copy_id && other.unpublished {
                    return Err("Another retained copy has unpublished work. Preserve those copies before recovering this one.".into());
                }
            }
            let record = self.record_path(&receipt_copy.session.library)?;
            let raw = fs::read(&record)?;
            let evidence = self.root.join("recovery-records");
            transfer::immutable(&evidence.join(format!("{}-{}.json", receipt_copy.session.library, Uuid::new_v4())), &raw)?;
            sync_dir(&evidence)?;
            sync_dir(&self.root)?;
            self.write_session(&receipt_copy.session)?;
            return self.recover(&receipt_copy.session.library)?
                .ok_or_else(|| "Recovery activation failed; files retained".into());
        }
        let copy = self.recovery_copy(&directory)?;
        if let Some(current) = self.recover(&copy.session.library)? {
            if current.session.copy != copy_id && current.unpublished {
                return Err(
                    "Save the current unpublished work before choosing another recovery copy"
                        .into(),
                );
            }
            if current.session.copy == copy_id {
                return Ok(current);
            }
        }
        self.write_session(&copy.session)?;
        self.reconcile_publication(&copy.session.library)?;
        self.recover(&copy.session.library)?
            .ok_or_else(|| "Recovery activation failed; files retained".into())
    }
    /// Save As is deliberately create-new-only; it never overrides a conflicting existing file.
    pub fn publish(
        &self,
        library: &str,
        revision: &str,
        save_as: Option<&Path>,
    ) -> Result<WorkingCopy> {
        self.publish_with_checkpoint(library, revision, save_as, |_| Ok(()))
    }
    fn publish_with_checkpoint(
        &self,
        library: &str,
        revision: &str,
        save_as: Option<&Path>,
        mut checkpoint: impl FnMut(&str) -> Result<()>,
    ) -> Result<WorkingCopy> {
        self.reconcile_publication(library)?;
        let working = self.recover(library)?.ok_or("Unknown portable library")?;
        let repo = Repository::open(&working.database())?;
        let assert_revision = || -> Result<()> {
            if repo.identity()?.1.as_deref() != Some(revision) {
                return Err("Conflict: local revision changed; retry saving".into());
            }
            Ok(())
        };
        assert_revision()?;
        let (destination, expected) = if let Some(path) = save_as {
            if path.exists() {
                return Err("Save As requires a new filename; existing file retained".into());
            }
            let parent = path
                .parent()
                .ok_or("Missing destination directory")?
                .canonicalize()?;
            (
                parent.join(path.file_name().ok_or("Missing filename")?),
                None,
            )
        } else {
            (
                working.session.master.clone(),
                Some(working.session.base_fingerprint.clone()),
            )
        };
        if destination.starts_with(&self.root) {
            return Err("The library file must be outside YTNH's own data folder".into());
        }
        let check_destination = || -> Result<()> {
            match &expected {
                Some(expected) if fingerprint(&destination, self.limits.bytes)? != *expected => {
                    Err("Conflict: the library file was changed outside YTNH; use Save As or cancel".into())
                }
                None if fs::symlink_metadata(&destination).is_ok() => {
                    Err("Conflict: destination already exists".into())
                }
                _ => Ok(()),
            }
        };
        check_destination()?;
        if save_as.is_none() && !working.unpublished {
            return Ok(working);
        }
        if expected.is_some() && fs::metadata(&destination)?.permissions().readonly() {
            return Err("The library file is read-only; use Save As or cancel".into());
        }
        let publications = self.root.join("publications");
        fs::create_dir_all(&publications)?;
        let candidate = Uuid::new_v4().to_string();
        let folder = publications.join(&candidate);
        fs::create_dir(&folder)?;
        let package = folder.join("master.ytnh");
        let manifest = create(
            &repo,
            &working.objects(),
            &package,
            &self.root.join("staging"),
            self.limits,
        )?;
        if manifest.state["revision"] != revision {
            return Err("Conflict: snapshot revision changed".into());
        }
        checkpoint("candidate")?;
        assert_revision()?;
        let publication = Publication {
            version: VERSION,
            previous: working.session.clone(),
            destination: destination.clone(),
            expected: expected.clone(),
            candidate,
            fingerprint: fingerprint(&package, self.limits.bytes)?,
            revision: revision.into(),
        };
        let receipt = canonical(&serde_json::to_value(&publication)?);
        transfer::immutable(&folder.join("publication.json"), &receipt)?;
        sync_dir(&folder)?;
        sync_dir(&publications)?;
        let mut pointer = NamedTempFile::new_in(self.root.join("sessions"))?;
        pointer.write_all(&receipt)?;
        pointer.as_file().sync_all()?;
        pointer
            .persist(self.publication_path(library)?)
            .map_err(|e| e.error)?;
        sync_dir(&self.root.join("sessions"))?;
        checkpoint("pending")?;
        let parent = destination.parent().ok_or("The library file's folder is missing")?;
        let mut staged = NamedTempFile::new_in(parent)?;
        if copy_hash(
            &mut regular(&package)?,
            staged.as_file_mut(),
            self.limits.bytes,
        )? != publication.fingerprint
        {
            return Err("Candidate changed before publication".into());
        }
        if expected.is_some() {
            let mut previous = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(folder.join("previous.ytnh"))?;
            if Some(copy_hash(
                &mut regular(&destination)?,
                &mut previous,
                self.limits.bytes,
            )?) != expected
            {
                return Err("Conflict: the library file changed while keeping a recovery copy".into());
            }
            previous.sync_all()?;
            sync_dir(&folder)?;
            staged
                .as_file()
                .set_permissions(fs::metadata(&destination)?.permissions())?;
        }
        staged.as_file().sync_all()?;
        let checked = verify(staged.path(), &self.root.join("staging"), self.limits)?;
        if checked.fingerprint != publication.fingerprint {
            return Err("Destination staging verification failed".into());
        }
        drop(checked);
        checkpoint("before_replace")?;
        assert_revision()?;
        check_destination()?;
        // Same-directory rename only: never truncate/copy over the live file as a fallback.
        // This cannot provide cross-device compare-and-swap against a noncooperating sync client.
        if expected.is_some() {
            staged.persist(&destination).map_err(|e| e.error)?;
        } else {
            staged
                .persist_noclobber(&destination)
                .map_err(|e| e.error)?;
        }
        sync_dir(parent)?;
        checkpoint("replaced")?;
        let checked = verify(&destination, &self.root.join("staging"), self.limits)?;
        if checked.fingerprint != publication.fingerprint {
            return Err("The library file changed after saving; your local recovery copy was kept".into());
        }
        let mut session = working.session;
        session.master = destination;
        session.base_fingerprint = publication.fingerprint;
        session.base_revision = revision.into();
        self.write_session(&session)?;
        checkpoint("recorded")?;
        self.recover(library)?
            .ok_or_else(|| "Local working copy unavailable after save".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fixture() -> (TempDir, WorkingStore, WorkingCopy) {
        let dir = tempfile::tempdir().unwrap();
        let mut model: V =
            serde_json::from_slice(include_bytes!("../../tests/fixtures/library.json")).unwrap();
        model["archiveIndex"] = json!([]);
        let mut repo = Repository::create(
            &dir.path().join("source.sqlite"),
            &Uuid::new_v4().to_string(),
            None,
        )
        .unwrap();
        repo.save(&model, None, "fixture").unwrap();
        let master = dir.path().join("Library.ytnh");
        create(
            &repo,
            &dir.path().join("objects"),
            &master,
            dir.path(),
            Limits::default(),
        )
        .unwrap();
        let store = WorkingStore::open(&dir.path().join("local"), Limits::default()).unwrap();
        let copy = store.load(&master).unwrap();
        (dir, store, copy)
    }
    fn edit(copy: &WorkingCopy, title: &str) -> String {
        let mut repo = Repository::open(&copy.database()).unwrap();
        let mut model = repo.load().unwrap();
        model["items"][0]["title"] = json!(title);
        repo.save(&model, repo.identity().unwrap().1.as_deref(), "fixture")
            .unwrap()
    }
    #[test]
    fn successful_publish_is_verified_and_unchanged_save_does_not_write() {
        let (_dir, store, copy) = fixture();
        let original = fs::read(&copy.session.master).unwrap();
        let revision = edit(&copy, "Saved change");
        let saved = store
            .publish(&copy.session.library, &revision, None)
            .unwrap();
        assert!(!saved.unpublished);
        let verified = verify(
            &saved.session.master,
            &store.root.join("staging"),
            store.limits,
        )
        .unwrap();
        assert_eq!(
            Repository::open(&verified.database())
                .unwrap()
                .load()
                .unwrap()["items"][0]["title"],
            "Saved change"
        );
        let before = fs::metadata(&saved.session.master)
            .unwrap()
            .modified()
            .unwrap();
        store
            .publish(&copy.session.library, &revision, None)
            .unwrap();
        assert_eq!(
            before,
            fs::metadata(&saved.session.master)
                .unwrap()
                .modified()
                .unwrap()
        );
        let attempt = fs::read_dir(store.root.join("publications"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(attempt.join("previous.ytnh")).unwrap(), original);
    }
    #[test]
    fn recovery_listing_uses_active_publication_without_rewriting_receipts() {
        let (_dir, store, copy) = fixture();
        let receipt_path = copy.directory.join("session.json");
        let receipt = fs::read(&receipt_path).unwrap();
        let revision = edit(&copy, "Published");
        assert!(store.recovery_copies().unwrap()[0].unpublished);
        let destination = store.root.parent().unwrap().join("Renamed.ytnh");
        store.publish(&copy.session.library, &revision, Some(&destination)).unwrap();
        let listed = store.recovery_copies().unwrap();
        assert!(!listed[0].unpublished);
        assert_eq!(listed[0].session.master, destination);
        assert_eq!(listed[0].session.base_revision, revision);
        assert_eq!(fs::read(&receipt_path).unwrap(), receipt);
        edit(&copy, "New local edit");
        assert!(store.recovery_copies().unwrap()[0].unpublished);
        assert_eq!(fs::read(&receipt_path).unwrap(), receipt);
    }

    #[test]
    fn faults_before_and_after_replacement_recover_without_losing_edits() {
        for phase in [
            "candidate",
            "pending",
            "before_replace",
            "replaced",
            "recorded",
        ] {
            let (dir, store, copy) = fixture();
            let original = fs::read(&copy.session.master).unwrap();
            let revision = edit(&copy, "Recover me");
            assert!(store
                .publish_with_checkpoint(&copy.session.library, &revision, None, |at| {
                    if at == phase {
                        Err("Injected failure".into())
                    } else {
                        Ok(())
                    }
                })
                .is_err());
            if !matches!(phase, "replaced" | "recorded") {
                assert_eq!(fs::read(&copy.session.master).unwrap(), original);
            }
            drop(store);
            let reopened =
                WorkingStore::open(&dir.path().join("local"), Limits::default()).unwrap();
            reopened
                .reconcile_publication(&copy.session.library)
                .unwrap();
            let local = reopened.recover(&copy.session.library).unwrap().unwrap();
            assert_eq!(
                Repository::open(&local.database()).unwrap().load().unwrap()["items"][0]["title"],
                "Recover me"
            );
            let saved = reopened
                .publish(&copy.session.library, &revision, None)
                .unwrap();
            assert!(!saved.unpublished);
        }
    }
    #[test]
    fn external_change_at_last_check_is_not_overwritten() {
        let (_dir, store, copy) = fixture();
        let revision = edit(&copy, "Local");
        assert!(store
            .publish_with_checkpoint(&copy.session.library, &revision, None, |at| {
                if at == "before_replace" {
                    fs::write(&copy.session.master, b"external replacement")?;
                }
                Ok(())
            })
            .is_err());
        assert_eq!(
            fs::read(&copy.session.master).unwrap(),
            b"external replacement"
        );
        assert!(
            store
                .recover(&copy.session.library)
                .unwrap()
                .unwrap()
                .unpublished
        );
    }
    #[test]
    fn local_change_during_packaging_is_not_marked_published() {
        let (_dir, store, copy) = fixture();
        let revision = edit(&copy, "First");
        assert!(store
            .publish_with_checkpoint(&copy.session.library, &revision, None, |at| {
                if at == "candidate" {
                    edit(&copy, "Latest");
                }
                Ok(())
            })
            .is_err());
        assert!(
            store
                .recover(&copy.session.library)
                .unwrap()
                .unwrap()
                .unpublished
        );
        assert_eq!(
            store
                .session(&copy.session.library)
                .unwrap()
                .unwrap()
                .base_revision,
            copy.session.base_revision
        );
    }
    #[test]
    fn save_as_preserves_conflicting_master_and_reconnects() {
        let (dir, store, copy) = fixture();
        let revision = edit(&copy, "Local");
        fs::write(&copy.session.master, b"external").unwrap();
        assert!(store
            .publish(&copy.session.library, &revision, None)
            .is_err());
        let destination = dir.path().join("Recovered.ytnh");
        let saved = store
            .publish(&copy.session.library, &revision, Some(&destination))
            .unwrap();
        assert_eq!(fs::read(&copy.session.master).unwrap(), b"external");
        assert_eq!(saved.session.master, destination.canonicalize().unwrap());
        assert!(!saved.unpublished);
        assert!(store
            .publish(&copy.session.library, &revision, Some(&destination))
            .is_err());
    }
    #[test]
    fn missing_master_is_not_silently_recreated() {
        let (_dir, store, copy) = fixture();
        let revision = edit(&copy, "Local");
        fs::remove_file(&copy.session.master).unwrap();
        assert!(store
            .publish(&copy.session.library, &revision, None)
            .is_err());
        assert!(!copy.session.master.exists());
        assert!(copy.database().exists());
    }
    #[test]
    fn reconciliation_keeps_edits_after_an_interrupted_success() {
        let (_dir, store, copy) = fixture();
        let first = edit(&copy, "Published");
        assert!(store
            .publish_with_checkpoint(&copy.session.library, &first, None, |at| {
                if at == "replaced" {
                    Err("Interrupted".into())
                } else {
                    Ok(())
                }
            })
            .is_err());
        edit(&copy, "New local edits");
        store.reconcile_publication(&copy.session.library).unwrap();
        let recovered = store.recover(&copy.session.library).unwrap().unwrap();
        assert!(recovered.unpublished);
        assert_eq!(recovered.session.base_revision, first);
        assert_eq!(
            Repository::open(&recovered.database())
                .unwrap()
                .load()
                .unwrap()["items"][0]["title"],
            "New local edits"
        );
    }
    #[test]
    fn damaged_candidate_never_replaces_master() {
        let (_dir, store, copy) = fixture();
        let before = fs::read(&copy.session.master).unwrap();
        let revision = edit(&copy, "Local");
        assert!(store
            .publish_with_checkpoint(&copy.session.library, &revision, None, |at| {
                if at == "pending" {
                    let bytes = fs::read(store.publication_path(&copy.session.library)?)?;
                    let publication: Publication = serde_json::from_slice(&bytes)?;
                    fs::write(
                        store
                            .root
                            .join("publications")
                            .join(publication.candidate)
                            .join("master.ytnh"),
                        b"damaged",
                    )?;
                }
                Ok(())
            })
            .is_err());
        assert_eq!(fs::read(&copy.session.master).unwrap(), before);
        assert!(
            store
                .recover(&copy.session.library)
                .unwrap()
                .unwrap()
                .unpublished
        );
    }
    #[cfg(unix)]
    #[test]
    fn readonly_master_is_retained_and_save_as_remains_available() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, store, copy) = fixture();
        let before = fs::read(&copy.session.master).unwrap();
        let revision = edit(&copy, "Local");
        let original = fs::metadata(&copy.session.master).unwrap().permissions();
        fs::set_permissions(&copy.session.master, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(store
            .publish(&copy.session.library, &revision, None)
            .is_err());
        assert_eq!(fs::read(&copy.session.master).unwrap(), before);
        store
            .publish(
                &copy.session.library,
                &revision,
                Some(&dir.path().join("Writable.ytnh")),
            )
            .unwrap();
        fs::set_permissions(&copy.session.master, original).unwrap();
    }
    #[test]
    fn explicit_orphan_recovery_preserves_local_edits() {
        let (_dir, store, copy) = fixture();
        edit(&copy, "Recover explicitly");
        fs::remove_file(store.record_path(&copy.session.library).unwrap()).unwrap();
        assert!(store.load(&copy.session.master).is_err());
        let adopted = store.adopt_recovery(&copy.session.copy).unwrap();
        assert!(adopted.unpublished);
        assert_eq!(adopted.directory, copy.directory);
    }
}
