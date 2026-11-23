//! Synthetic-only native filesystem tests. No installed libraries or cloud folders are used.
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tempfile::{tempdir, TempDir};
use uuid::Uuid;
use yutanohe_library::{
    images,
    portable::{self, Limits, WorkingStore},
    transfer, Repository,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

struct Fixture {
    dir: TempDir,
    repo: Repository,
    vault: PathBuf,
    master: PathBuf,
    image: String,
}
impl Fixture {
    fn new() -> Self {
        let dir = tempdir().unwrap();
        let vault = dir.path().join("vault");
        let image =
            images::store_original(&vault, include_bytes!("fixtures/images/pixel.gif"), false)
                .unwrap();
        let mut model: Value =
            serde_json::from_slice(include_bytes!("fixtures/library.json")).unwrap();
        model["settings"]["pinnedItems"] = json!([model["items"][0]["id"]]);
        model["items"][0]["content"] = json!(format!(
            "<img src=\"assets/{}.gif\" width=\"240\" alt=\"Resized\">",
            image.hash
        ));
        model["imageAssets"][&image.hash] =
            json!({"bytes":image.bytes,"extension":"gif","name":"test.gif"});
        let mut archive: Value =
            serde_json::from_slice(include_bytes!("fixtures/cold-archive.json")).unwrap();
        archive["items"][0]["content"] = json!(format!("![Archived](assets/{}.gif)", image.hash));
        fs::write(
            dir.path().join("cold-archive.json"),
            serde_json::to_vec(&archive).unwrap(),
        )
        .unwrap();
        let inventory =
            transfer::stage_archives(&model, dir.path(), &vault, &Default::default()).unwrap();
        let mut repo = Repository::create(
            &dir.path().join("source.sqlite"),
            &Uuid::new_v4().to_string(),
            None,
        )
        .unwrap();
        repo.save_with_files(&model, None, "synthetic", &inventory)
            .unwrap();
        let master = dir.path().join("Library ü.ytnh");
        Self {
            dir,
            repo,
            vault,
            master,
            image: image.hash,
        }
    }
    fn pack(&self) {
        portable::create(
            &self.repo,
            &self.vault,
            &self.master,
            &self.dir.path().join("stage"),
            Limits::default(),
        )
        .unwrap();
    }
    fn verify(&self, path: &Path) -> bool {
        portable::verify(path, &self.dir.path().join("verify"), Limits::default()).is_ok()
    }
    fn store(&self) -> WorkingStore {
        WorkingStore::open(&self.dir.path().join("local"), Limits::default()).unwrap()
    }
    fn revised(&mut self, title: &str, filename: &str) -> PathBuf {
        let mut model = self.repo.load().unwrap();
        model["items"][0]["title"] = json!(title);
        self.repo
            .save(&model, self.repo.identity().unwrap().1.as_deref(), "remote")
            .unwrap();
        let path = self.dir.path().join(filename);
        portable::create(
            &self.repo,
            &self.vault,
            &path,
            &self.dir.path().join("stage"),
            Limits::default(),
        )
        .unwrap();
        path
    }
}
fn edit(path: &Path) {
    let mut repo = Repository::open(path).unwrap();
    let mut model = repo.load().unwrap();
    model["items"][0]["title"] = json!("Unpublished local edit");
    repo.save(&model, repo.identity().unwrap().1.as_deref(), "local")
        .unwrap();
}
fn entries(path: &Path) -> Vec<(String, Vec<u8>)> {
    let mut zip = ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
    (0..zip.len())
        .map(|i| {
            let mut file = zip.by_index(i).unwrap();
            let name = file.name().unwrap().into_owned();
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).unwrap();
            (name, bytes)
        })
        .collect()
}
fn repack(path: &Path, entries: &[(String, Vec<u8>)]) {
    let mut zip = ZipWriter::new(fs::File::create(path).unwrap());
    for (name, bytes) in entries {
        zip.start_file(
            name,
            SimpleFileOptions::default()
                .compression_method(CompressionMethod::Stored)
                .large_file(true),
        )
        .unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap().sync_all().unwrap();
}

#[test]
fn exact_roundtrip_includes_archives_images_dimensions_and_identities() {
    let f = Fixture::new();
    let before = fs::read(f.dir.path().join("source.sqlite")).unwrap();
    f.pack();
    let verified = portable::verify(&f.master, &f.dir.path().join("v"), Limits::default()).unwrap();
    let repo = Repository::open(&verified.database()).unwrap();
    assert_eq!(repo.load().unwrap(), f.repo.load().unwrap());
    assert_eq!(repo.identity().unwrap(), f.repo.identity().unwrap());
    assert_eq!(repo.inventory().unwrap(), f.repo.inventory().unwrap());
    assert_eq!(verified.manifest.objects.len(), 2); // One image shared by active and cold documents.
    for (hash, _) in &verified.manifest.objects {
        assert_eq!(
            fs::read(verified.objects().join(&hash)).unwrap(),
            fs::read(f.vault.join(hash)).unwrap()
        );
    }
    assert_eq!(
        fs::read(f.dir.path().join("source.sqlite")).unwrap(),
        before
    );
}
#[test]
fn creation_never_overwrites_or_publishes_missing_assets() {
    let f = Fixture::new();
    f.pack();
    let original = fs::read(&f.master).unwrap();
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &f.master,
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
    fs::remove_file(f.vault.join(&f.image)).unwrap();
    let missing = f.dir.path().join("missing.ytnh");
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &missing,
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
    assert!(!missing.exists());
    assert_eq!(fs::read(&f.master).unwrap(), original);
}
#[test]
fn rejects_corruption_missing_extra_and_traversal_entries() {
    let f = Fixture::new();
    f.pack();
    let original = entries(&f.master);
    let bad = f.dir.path().join("bad.ytnh");
    for name in ["library.sqlite".to_owned(), format!("objects/{}", f.image)] {
        let mut e = original.clone();
        e.iter_mut().find(|(n, _)| n == &name).unwrap().1[0] ^= 1;
        repack(&bad, &e);
        assert!(!f.verify(&bad), "Corruption: {name}");
        e = original.clone();
        e.retain(|(n, _)| n != &name);
        repack(&bad, &e);
        assert!(!f.verify(&bad), "Missing: {name}");
    }
    for name in [
        "../escape",
        "objects/../../escape",
        "objects/UPPERCASE",
        "extra",
        "library.sqlite-wal",
    ] {
        let mut e = original.clone();
        e.push((name.into(), vec![1]));
        repack(&bad, &e);
        assert!(!f.verify(&bad), "Unsafe entry: {name}");
    }
    assert!(!f.dir.path().join("escape").exists());
}
#[test]
fn rejects_unknown_version_false_revision_and_inventory() {
    let f = Fixture::new();
    f.pack();
    let bad = f.dir.path().join("bad.ytnh");
    for mutation in 0..4 {
        let mut e = entries(&f.master);
        let bytes = &mut e.iter_mut().find(|(n, _)| n == "manifest.json").unwrap().1;
        let mut m: Value = serde_json::from_slice(bytes).unwrap();
        match mutation {
            0 => m["version"] = json!(2),
            1 => m["state"]["revision"] = json!("fake"),
            2 => {
                m["objects"].as_object_mut().unwrap().clear();
            }
            _ => m["database"]["bytes"] = json!(1),
        }
        *bytes = serde_json::to_vec(&m).unwrap();
        repack(&bad, &e);
        assert!(!f.verify(&bad));
    }
}
#[test]
fn rejects_truncated_and_duplicate_packages() {
    let f = Fixture::new();
    f.pack();
    let bytes = fs::read(&f.master).unwrap();
    let bad = f.dir.path().join("bad.ytnh");
    for length in [0, 10, bytes.len() / 2, bytes.len() - 1] {
        fs::write(&bad, &bytes[..length]).unwrap();
        assert!(!f.verify(&bad));
    }
    let mut e = entries(&f.master);
    e.push((
        "manifest.jsox".into(),
        e.iter()
            .find(|(n, _)| n == "manifest.json")
            .unwrap()
            .1
            .clone(),
    ));
    repack(&bad, &e);
    let mut bytes = fs::read(&bad).unwrap();
    for i in 0..bytes.len() - 13 {
        if &bytes[i..i + 13] == b"manifest.jsox" {
            bytes[i + 12] = b'n';
        }
    }
    fs::write(&bad, bytes).unwrap();
    assert!(!f.verify(&bad));
}
#[test]
fn resource_limits_reject_without_truncation_or_activation() {
    let f = Fixture::new();
    f.pack();
    for limits in [
        Limits {
            bytes: 100,
            entries: 100,
        },
        Limits {
            bytes: 1 << 30,
            entries: 2,
        },
    ] {
        assert!(portable::verify(&f.master, &f.dir.path().join("v"), limits).is_err());
    }
}
#[test]
fn local_work_survives_restart_and_missing_master() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    assert!(!copy.unpublished);
    edit(&copy.database());
    drop(store);
    fs::remove_file(&f.master).unwrap();
    let recovered = f.store().recover(&copy.session.library).unwrap().unwrap();
    assert!(recovered.unpublished);
    assert_eq!(
        Repository::open(&recovered.database())
            .unwrap()
            .load()
            .unwrap()["items"][0]["title"],
        "Unpublished local edit"
    );
}
#[test]
fn unchanged_master_never_discards_unpublished_local_edits() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    edit(&copy.database());
    let reopened = store.load(&f.master).unwrap();
    assert!(reopened.unpublished);
    assert_eq!(reopened.directory, copy.directory);
}
#[test]
fn changed_master_cannot_overwrite_unpublished_local_work() {
    let mut f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    edit(&copy.database());
    let newer = f.revised("remote", "newer.ytnh");
    assert!(store
        .load(&newer)
        .unwrap_err()
        .to_string()
        .contains("aren't saved to it yet"));
    assert_eq!(
        store
            .recover(&copy.session.library)
            .unwrap()
            .unwrap()
            .directory,
        copy.directory
    );
}
#[test]
fn clean_local_copy_accepts_verified_descendant_but_rejects_stale_master() {
    let mut f = Fixture::new();
    f.pack();
    let store = f.store();
    let old = store.load(&f.master).unwrap();
    let newer = f.revised("remote", "newer.ytnh");
    let new = store.load(&newer).unwrap();
    assert_ne!(old.directory, new.directory);
    assert!(old.database().exists());
    assert!(store
        .load(&f.master)
        .unwrap_err()
        .to_string()
        .contains("older than or different"));
    assert_eq!(
        store
            .recover(&new.session.library)
            .unwrap()
            .unwrap()
            .directory,
        new.directory
    );
}
#[test]
fn failed_verification_keeps_current_pointer_and_objects() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    let old = store.load(&f.master).unwrap();
    let record = f
        .dir
        .path()
        .join("local/sessions")
        .join(format!("{}.json", old.session.library));
    let before = fs::read(&record).unwrap();
    fs::write(&f.master, b"incomplete sync").unwrap();
    assert!(store.load(&f.master).is_err());
    assert_eq!(fs::read(record).unwrap(), before);
    assert!(store.recover(&old.session.library).unwrap().is_some());
}
#[test]
fn exclusive_store_lock_and_invalid_local_record_fail_closed() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    assert!(WorkingStore::open(&f.dir.path().join("local"), Limits::default()).is_err());
    let copy = store.load(&f.master).unwrap();
    let record = f
        .dir
        .path()
        .join("local/sessions")
        .join(format!("{}.json", copy.session.library));
    fs::write(record, b"broken").unwrap();
    assert!(store.load(&f.master).is_err());
    assert!(copy.database().exists());
    assert!(store.recover("../escape").is_err());
}
#[cfg(unix)]
#[test]
fn rejects_symlink_master_and_object() {
    let f = Fixture::new();
    f.pack();
    let link = f.dir.path().join("link.ytnh");
    std::os::unix::fs::symlink(&f.master, &link).unwrap();
    assert!(!f.verify(&link));
    let object = f.vault.join(&f.image);
    let moved = f.dir.path().join("original.gif");
    fs::rename(&object, &moved).unwrap();
    std::os::unix::fs::symlink(moved, object).unwrap();
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &f.dir.path().join("other.ytnh"),
        &f.dir.path().join("stage"),
        Limits::default()
    )
    .is_err());
}

#[test]
fn interrupted_activation_copies_are_discoverable_without_auto_adoption() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    edit(&copy.database());
    // Simulate the durable-copy / missing-session-pointer boundary of an interrupted activation.
    fs::remove_file(
        f.dir
            .path()
            .join("local/sessions")
            .join(format!("{}.json", copy.session.library)),
    )
    .unwrap();
    let found = store.recovery_copies().unwrap();
    assert_eq!(found.len(), 1);
    assert!(found[0].unpublished);
    assert_eq!(found[0].directory, copy.directory);
    assert!(store
        .load(&f.master)
        .unwrap_err()
        .to_string()
        .contains("Unregistered"));
    assert!(copy.database().exists());
}
#[test]
fn explicitly_selected_new_path_remembers_location_without_resetting_local_edits() {
    let f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    edit(&copy.database());
    let relocated = f.dir.path().join("relocated.ytnh");
    fs::copy(&f.master, &relocated).unwrap();
    let result = store.load(&relocated).unwrap();
    assert_eq!(result.session.master, relocated.canonicalize().unwrap());
    assert_eq!(result.directory, copy.directory);
    assert!(result.unpublished);
    drop(store);
    assert_eq!(
        f.store()
            .recover(&copy.session.library)
            .unwrap()
            .unwrap()
            .session
            .master,
        relocated.canonicalize().unwrap()
    );
}
#[test]
fn only_archived_image_and_planner_image_are_included() {
    let mut f = Fixture::new();
    let mut model = f.repo.load().unwrap();
    model["items"][0]["content"] = json!("No active image");
    let svg = images::store_original(
        &f.vault,
        b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>",
        false,
    )
    .unwrap();
    model["imageAssets"][&svg.hash] =
        json!({"bytes":svg.bytes,"extension":"svg","name":"Meeting.svg"});
    let meeting = Uuid::new_v4().to_string();
    let source = Uuid::new_v4().to_string();
    model["planner"] = json!({"sessions":{},"rules":{},"meetings":{},"sources":{},"settings":{"start":420,"end":1140}});
    model["planner"]["sources"][&source] = json!({"name":"Outlook","history":[]});
    model["planner"]["meetings"][&meeting] = json!({"id":meeting,"source":source,"uid":"fixture","title":"Meeting","content":format!("![Meeting](assets/{}.svg)",svg.hash),"versions":[{"from":"2026-11-09","date":"2026-11-09","start":540,"end":600,"span":0,"zone":"UTC","enabled":true}],"exceptions":{},"coverage":{}});
    f.repo
        .save(&model, f.repo.identity().unwrap().1.as_deref(), "fixture")
        .unwrap();
    f.pack();
    let verified = portable::verify(&f.master, &f.dir.path().join("v"), Limits::default()).unwrap();
    assert!(verified.objects().join(f.image).exists());
    assert!(verified.objects().join(svg.hash).exists());
    assert_eq!(
        Repository::open(&verified.database())
            .unwrap()
            .load()
            .unwrap(),
        model
    );
}
#[test]
fn metadata_allocation_limits_are_checked_before_zip_indexing() {
    let f = Fixture::new();
    f.pack();
    let mut bytes = fs::read(&f.master).unwrap();
    let end = bytes.len() - 22;
    bytes[end + 12..end + 16].copy_from_slice(&(40u32 * 1024 * 1024).to_le_bytes());
    let bad = f.dir.path().join("metadata.ytnh");
    fs::write(&bad, bytes).unwrap();
    assert!(!f.verify(&bad));
}

#[test]
fn divergent_clean_master_is_rejected_even_with_matching_library_id() {
    let mut f = Fixture::new();
    f.pack();
    let branch = f.dir.path().join("branch.sqlite");
    f.repo.snapshot(&branch).unwrap();
    let store = f.store();
    store.load(&f.master).unwrap();
    let descendant = f.revised("First branch", "descendant.ytnh");
    let current = store.load(&descendant).unwrap();
    edit(&branch);
    let diverged = f.dir.path().join("diverged.ytnh");
    portable::create(
        &Repository::open(&branch).unwrap(),
        &f.vault,
        &diverged,
        &f.dir.path().join("s"),
        Limits::default(),
    )
    .unwrap();
    assert!(store
        .load(&diverged)
        .unwrap_err()
        .to_string()
        .contains("older than or different"));
    assert_eq!(
        store
            .recover(&current.session.library)
            .unwrap()
            .unwrap()
            .directory,
        current.directory
    );
}
#[test]
fn missing_cold_archive_blocks_new_master_without_changing_source() {
    let f = Fixture::new();
    let model = f.repo.load().unwrap();
    let hash = f
        .repo
        .inventory()
        .unwrap()
        .values()
        .next()
        .unwrap()
        .0
        .clone();
    fs::remove_file(f.vault.join(hash)).unwrap();
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &f.master,
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
    assert!(!f.master.exists());
    assert_eq!(f.repo.load().unwrap(), model);
}
#[test]
fn semantic_archive_corruption_is_rejected_even_with_updated_checksums() {
    let f = Fixture::new();
    f.pack();
    let mut model = f.repo.load().unwrap();
    let mut archive: Value =
        serde_json::from_slice(include_bytes!("fixtures/cold-archive.json")).unwrap();
    archive["itemCount"] = json!(999);
    let bytes = serde_json::to_vec(&archive).unwrap();
    let hash = yutanohe_library::digest(&bytes);
    fs::write(f.vault.join(&hash), &bytes).unwrap();
    // A source repository cannot publish an archive that fails semantic verification, even if
    // inventory hashes are internally self-consistent. No automatic repair is attempted.
    let mut inventory = f.repo.inventory().unwrap();
    *inventory.values_mut().next().unwrap() = (hash, bytes.len() as u64);
    model["updatedAt"] = json!("2026-11-15T00:00:00Z");
    let path = f.dir.path().join("corrupt-source.sqlite");
    f.repo.snapshot(&path).unwrap();
    let mut repo = Repository::open(&path).unwrap();
    repo.save_with_files(
        &model,
        repo.identity().unwrap().1.as_deref(),
        "fixture",
        &inventory,
    )
    .unwrap();
    assert!(portable::create(
        &repo,
        &f.vault,
        &f.dir.path().join("bad.ytnh"),
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
}

#[test]
fn missing_image_catalog_never_hides_required_images() {
    let mut f = Fixture::new();
    let mut model = f.repo.load().unwrap();
    model.as_object_mut().unwrap().remove("imageAssets");
    f.repo
        .save(&model, f.repo.identity().unwrap().1.as_deref(), "fixture")
        .unwrap();
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &f.master,
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
    model["items"][0]["content"] = json!("Only archived image remains");
    f.repo
        .save(&model, f.repo.identity().unwrap().1.as_deref(), "fixture")
        .unwrap();
    assert!(portable::create(
        &f.repo,
        &f.vault,
        &f.master,
        &f.dir.path().join("s"),
        Limits::default()
    )
    .is_err());
    assert!(!f.master.exists());
}

#[test]
fn portable_local_backups_do_not_automatically_prune_recovery_history() {
    let f = Fixture::new();
    let folder = f.dir.path().join("retained-backups");
    for _ in 0..12 {
        yutanohe_library::lifecycle::backup_retained(&f.repo, &folder, &f.vault, true).unwrap();
    }
    let snapshots = fs::read_dir(&folder)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "sqlite"))
        .count();
    assert_eq!(snapshots, 12);
    assert_eq!(
        fs::read(folder.join("objects").join(&f.image)).unwrap(),
        include_bytes!("fixtures/images/pixel.gif")
    );
}

#[test]
fn partial_recovery_reports_damage_without_blocking_explicit_verified_recovery() {
    let f = Fixture::new(); f.pack(); let store=f.store();
    let copy=store.load(&f.master).unwrap();
    let bad=f.dir.path().join("local/copies").join(Uuid::new_v4().to_string());
    fs::create_dir(&bad).unwrap(); fs::write(bad.join("session.json"), b"{").unwrap();
    let report=store.recovery_report().unwrap();
    assert_eq!(report.copies.len(),1); assert_eq!(report.issues.len(),1);
    assert_eq!(report.issues[0].copy,bad.file_name().unwrap().to_str().unwrap());
    assert!(store.recovery_copies().is_err());
    // Simulate a lost activation pointer. Automatic activation remains blocked.
    fs::remove_file(f.dir.path().join("local/sessions").join(format!("{}.json",copy.session.library))).unwrap();
    assert!(store.load(&f.master).is_err());
    assert_eq!(store.adopt_recovery(&copy.session.copy).unwrap().directory,copy.directory);
    assert!(store.adopt_recovery(bad.file_name().unwrap().to_str().unwrap()).is_err());
    assert_eq!(fs::read(bad.join("session.json")).unwrap(),b"{");
}

#[test]
fn complete_master_can_be_rebuilt_from_retained_backup_and_objects() {
    let f=Fixture::new(); f.pack();
    let folder=f.dir.path().join("recovery-backup");
    yutanohe_library::lifecycle::backup_retained(&f.repo,&folder,&f.vault,true).unwrap();
    let snapshot=fs::read_dir(&folder).unwrap().map(|e|e.unwrap().path()).find(|p|p.extension().is_some_and(|x|x=="sqlite")).unwrap();
    let backup=Repository::open(&snapshot).unwrap();
    assert_eq!(backup.load().unwrap(),f.repo.load().unwrap());
    let recovered=f.dir.path().join("Recovered.ytnh");
    portable::create(&backup,&folder.join("objects"),&recovered,&f.dir.path().join("stage"),Limits::default()).unwrap();
    let verified=portable::verify(&recovered,&f.dir.path().join("check"),Limits::default()).unwrap();
    assert_eq!(Repository::open(&verified.database()).unwrap().load().unwrap(),f.repo.load().unwrap());
    assert_eq!(fs::read(verified.objects().join(&f.image)).unwrap(),include_bytes!("fixtures/images/pixel.gif"));
    assert_eq!(backup.identity().unwrap(),f.repo.identity().unwrap());
    fs::write(folder.join("objects").join(&f.image),b"corrupt").unwrap();
    let rejected=f.dir.path().join("Rejected.ytnh");
    assert!(portable::create(&backup,&folder.join("objects"),&rejected,&f.dir.path().join("stage"),Limits::default()).is_err());
    assert!(!rejected.exists()); assert!(f.verify(&recovered)); assert!(f.verify(&f.master));
}

#[test]
fn damaged_active_session_does_not_hide_verified_recovery() {
    let f=Fixture::new(); f.pack(); let store=f.store();
    let copy=store.load(&f.master).unwrap();
    let master=fs::read(&f.master).unwrap();
    let mut repo=Repository::open(&copy.database()).unwrap();
    let mut model=repo.load().unwrap(); model["items"][0]["title"]=serde_json::json!("Unpublished recovery edit");
    repo.save(&model,repo.identity().unwrap().1.as_deref(),"test").unwrap();
    let record=f.dir.path().join("local/sessions").join(format!("{}.json",copy.session.library));
    fs::write(&record,b"damaged session").unwrap();
    let report=store.recovery_report().unwrap();
    assert_eq!(report.copies.len(),1); assert_eq!(report.issues.len(),1);
    assert!(store.recovery_copies().is_err()); assert!(store.load(&f.master).is_err());
    let restored=store.adopt_recovery(&copy.session.copy).unwrap();
    assert!(restored.unpublished);
    assert_eq!(Repository::open(&restored.database()).unwrap().load().unwrap(),model);
    assert_eq!(fs::read(&f.master).unwrap(),master);
    let evidence=fs::read_dir(f.dir.path().join("local/recovery-records")).unwrap().next().unwrap().unwrap().path();
    assert_eq!(fs::read(evidence).unwrap(),b"damaged session");
}

#[test]
fn damaged_session_recovery_does_not_choose_between_unpublished_copies() {
    let f=Fixture::new(); f.pack(); let store=f.store(); let copy=store.load(&f.master).unwrap();
    let other_id=Uuid::new_v4().to_string();let other=f.dir.path().join("local/copies").join(&other_id);
    fs::create_dir(&other).unwrap();fs::create_dir(other.join("objects")).unwrap();
    fs::copy(copy.database(),other.join("library.sqlite")).unwrap();
    for e in fs::read_dir(copy.objects()).unwrap(){let e=e.unwrap();fs::copy(e.path(),other.join("objects").join(e.file_name())).unwrap();}
    let mut receipt=copy.session.clone();receipt.copy=other_id;
    fs::write(other.join("session.json"),serde_json::to_vec(&receipt).unwrap()).unwrap();
    let mut repo=Repository::open(&other.join("library.sqlite")).unwrap();let mut model=repo.load().unwrap();model["items"][0]["title"]=serde_json::json!("Other unpublished work");
    repo.save(&model,repo.identity().unwrap().1.as_deref(),"test").unwrap();
    let record=f.dir.path().join("local/sessions").join(format!("{}.json",copy.session.library));fs::write(&record,b"damaged").unwrap();
    assert!(store.adopt_recovery(&copy.session.copy).unwrap_err().to_string().contains("Another retained copy"));
    assert_eq!(fs::read(record).unwrap(),b"damaged");assert_eq!(repo.load().unwrap(),model);
}
#[test]
fn keep_both_reads_the_other_computers_changes_and_then_replaces_the_file() {
    let mut f = Fixture::new();
    f.pack();
    let store = f.store();
    let copy = store.load(&f.master).unwrap();
    let library = copy.session.library.clone();
    edit(&copy.database());
    // Another computer changes a different item and saves over the same library file.
    let mut model = f.repo.load().unwrap();
    let other = model["items"][1]["id"].as_str().unwrap().to_owned();
    model["items"][1]["title"] = json!("Changed on the other computer");
    f.repo
        .save(&model, f.repo.identity().unwrap().1.as_deref(), "remote")
        .unwrap();
    fs::remove_file(&f.master).unwrap();
    f.pack();
    let local_head = Repository::open(&copy.database()).unwrap().identity().unwrap().1.unwrap();
    let refused = store.publish(&library, &local_head, None).unwrap_err().to_string();
    assert!(refused.contains("changed outside YTNH"), "{refused}");

    let conflict = store.read_conflict(&library).unwrap();
    assert_eq!(conflict["changed"], json!([other]));
    assert_eq!(conflict["model"]["items"][1]["title"], "Changed on the other computer");
    assert!(copy.objects().join(&f.image).exists());
    let seen: portable::FileDigest = serde_json::from_value(conflict["fingerprint"].clone()).unwrap();

    // A stale reading is refused; the current one lets the next save replace the file.
    let stale = portable::FileDigest { sha256: "0".repeat(64), bytes: seen.bytes };
    assert!(store.adopt_conflict(&library, &stale).unwrap_err().to_string().contains("changed again"));
    store.adopt_conflict(&library, &seen).unwrap();
    let published = store.publish(&library, &local_head, None).unwrap();
    assert!(!published.unpublished);
    let reopened = portable::verify(&f.master, &f.dir.path().join("check"), Limits::default()).unwrap();
    let saved = Repository::open(&reopened.database()).unwrap().load().unwrap();
    assert_eq!(saved["items"][0]["title"], "Unpublished local edit");
}
#[test]
fn keep_both_lists_nothing_for_unrelated_histories() {
    let f = Fixture::new();
    let repo = Repository::create(&f.dir.path().join("x.sqlite"), &Uuid::new_v4().to_string(), None).unwrap();
    assert_eq!(repo.items_changed_since("missing").unwrap(), None);
}
#[test]
fn images_only_pruned_backups_needed_are_removed() {
    use std::time::Duration;
    use yutanohe_library::lifecycle::{backup_retained, prune_backup_objects};
    let f = Fixture::new();
    let folder = f.dir.path().join("thinned-backups");
    backup_retained(&f.repo, &folder, &f.vault, true).unwrap();
    let objects = folder.join("objects");
    let kept: Vec<_> = fs::read_dir(&objects).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert!(kept.len() >= 2, "image and cold archive are backed up");
    let orphan = "ab".repeat(32);
    fs::write(objects.join(&orphan), b"only an old, pruned backup used this").unwrap();
    fs::write(objects.join("notes.txt"), b"not content-addressed").unwrap();
    // Recent files are kept while a backup may still be in progress.
    assert_eq!(prune_backup_objects(&folder, Duration::from_secs(3600)).unwrap(), 0);
    assert_eq!(prune_backup_objects(&folder, Duration::ZERO).unwrap(), 1);
    assert!(!objects.join(&orphan).exists());
    assert!(objects.join(&f.image).exists() && objects.join("notes.txt").exists());
    // An unreadable copy stops the cleanup: nothing is deleted.
    let unreadable = folder.join("0000000000000001-damaged.sqlite");
    fs::write(&unreadable, b"not a database").unwrap();
    fs::write(objects.join(&orphan), b"x").unwrap();
    assert!(prune_backup_objects(&folder, Duration::ZERO).is_err());
    assert!(objects.join(&orphan).exists() && objects.join(&f.image).exists());
    fs::remove_file(&unreadable).unwrap();
    // Once no backup copy is left, its images and archives can go.
    for entry in fs::read_dir(&folder).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|x| x == "sqlite") { fs::remove_file(path).unwrap(); }
    }
    assert_eq!(prune_backup_objects(&folder, Duration::ZERO).unwrap(), kept.len() + 1);
    assert!(objects.join("notes.txt").exists());
}
