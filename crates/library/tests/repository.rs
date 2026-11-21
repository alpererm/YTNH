use serde_json::{json, Value};
use std::{fs, path::Path};
use tempfile::tempdir;
use uuid::Uuid;
use yutanohe_library::{digest, transfer::*, portable::{self, Limits, WorkingStore}, Repository};

fn library() -> Value {
    let root = json!({"id":"aaa","type":"Note","title":"Üretim","content":"# H\n| A | B |\n|---|---|\n| one | two |","status":"Todo","order":4,"parentId":null,"rootId":"001.007","archived":false,"collapsed":true,"createdAt":"2026-11-01T08:00:00Z","updatedAt":"2026-11-02T15:00:00Z","explicitTags":["iş","work/project"],"codeAliases":[],"scheduledDates":["2026-11-06"],"occurrenceStates":{},"future":{"a":true}});
    let mut todo = root.clone();
    for(k,v) in json!({"id":"bbb","type":"Todo","parentId":"aaa","rootId":null,"order":9,"target":{"startMonth":"2026-11","endMonth":"2027-03"},"milestone":{"targetWeek":"2027-W03"},"recurrence":{"frequency":"weekly","startDate":"2026-11-06","interval":2,"weekDays":[1,3],"extra":"keep"},"occurrenceStates":{"2026-11-09":"Done"},"tagExclusions":["work"],"codeAliases":["001.007.2"],"content":"[[@{aaa}]] <span data-inline-todo=\"aaa\">literal</span>"}).as_object().unwrap(){todo[k]=v.clone()}
    json!({"format":"local-notes-todos","schemaVersion":10,"createdAt":"2026-11-01T08:00:00Z","updatedAt":"2026-11-02T15:00:00Z","nextRootOrdinal":8,"reusableRootOrdinals":[2,3],"items":[todo,root],"settings":{"hideWeekends":true},"linkAliases":{"001.007.2":"bbb"},"archiveIndex":[],"recurrenceSeries":[],"unknown":[1,true]})
}
fn archived(m: &mut Value, dir: &Path) {
    let mut item = library()["items"][1].clone();
    item["id"] = json!("cold1");
    item["type"] = json!("Todo");
    item["title"] = json!("Archived");
    item["archived"] = json!(true);
    item["rootId"] = json!("002.001");
    item["explicitTags"] = json!([]);
    m["archiveIndex"] = json!([{"id":"cold1","type":"Todo","parentId":null,"title":"Archived","code":"002.001","archiveId":"arch1","archiveFile":"old.json","tags":[]}]);
    fs::write(dir.join("old.json"),json!({"format":"local-notes-todos-cold-archive","schemaVersion":1,"archiveId":"arch1","sourceDatabaseCreatedAt":m["createdAt"],"itemCount":1,"items":[item],"codes":{"cold1":"002.001"}}).to_string()).unwrap();
}
#[test]
fn round_trip_transactions_and_placement_identity() {
    let d = tempdir().unwrap();
    let path = d.path().join("a.sqlite");
    let mut r = Repository::create(&path, &Uuid::new_v4().to_string(), None).unwrap();
    let mut m = library();
    let rev = r.save(&m, None, "desktop-A").unwrap();
    assert_eq!(r.load().unwrap(), m);
    assert_eq!(r.save(&m, Some(&rev), "desktop-A").unwrap(), rev);
    let mut bad = m.clone();
    bad["items"][0]["parentId"] = json!("bbb");
    assert!(r.save(&bad, Some(&rev), "A").is_err());
    bad = m.clone();
    bad["items"][0]["status"] = json!("invalid");
    assert!(r.save(&bad, Some(&rev), "A").is_err());
    assert_eq!(r.identity().unwrap().1.as_deref(), Some(rev.as_str()));
    let mut other = Repository::open(&path).unwrap();
    m["items"][0]["occurrencePostponements"] = json!({"2026-11-16":"2026-11-17"});
    m["items"][0]["content"] = json!("Updated\n\n**é**");
    let next = r.save(&m, Some(&rev), "A").unwrap();
    assert!(other.save(&library(), Some(&rev), "B").is_err());
    r.snapshot(&d.path().join("backup")).unwrap();
    r.check().unwrap();
    drop(r);
    assert_eq!(Repository::open(&path).unwrap().load().unwrap(), m);
    m["items"].as_array_mut().unwrap().remove(0);
    other.save(&m, Some(&next), "A").unwrap();
    assert_eq!(other.load().unwrap(), m);
    assert_eq!(
        Repository::open(&d.path().join("backup"))
            .unwrap()
            .load()
            .unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}
#[test]
fn portable_interchange_is_fail_closed() {
    let d=tempdir().unwrap(); let root=d.path();let vault=root.join("vault");
    let mut model=library();model["settings"]["pinnedItems"]=json!(["bbb","aaa"]);archived(&mut model,root);
    let inv=stage_archives(&model,root,&vault,&Default::default()).unwrap();
    let mut repo=Repository::create(&root.join("source.sqlite"),&Uuid::new_v4().to_string(),None).unwrap();
    repo.save_with_files(&model,None,"A",&inv).unwrap();
    let master=root.join("Library.ytnh");portable::create(&repo,&vault,&master,&root.join("stage"),Limits::default()).unwrap();
    let original=fs::read(&master).unwrap();let a=WorkingStore::open(&root.join("A"),Limits::default()).unwrap();
    let b=WorkingStore::open(&root.join("B"),Limits::default()).unwrap();let ac=a.load(&master).unwrap();let bc=b.load(&master).unwrap();
    let mut br=Repository::open(&bc.database()).unwrap();assert_eq!(br.load().unwrap(),model);
    model["items"][0]["title"]=json!("On B");let head=br.save_with_files(&model,br.identity().unwrap().1.as_deref(),"B",&inv).unwrap();
    b.publish(&bc.session.library,&head,None).unwrap();
    let latest=a.load(&master).unwrap();assert_eq!(Repository::open(&latest.database()).unwrap().load().unwrap(),model);
    let stale=root.join("Stale.ytnh");fs::write(&stale,&original).unwrap();assert!(a.load(&stale).is_err());
    let mut ar=Repository::open(&latest.database()).unwrap();let mut fork=model.clone();fork["items"][0]["content"]=json!("Unpublished");
    ar.save_with_files(&fork,ar.identity().unwrap().1.as_deref(),"A",&inv).unwrap();
    model["items"][0]["title"]=json!("Newer B");let head=br.save_with_files(&model,Some(&head),"B",&inv).unwrap();b.publish(&bc.session.library,&head,None).unwrap();
    assert!(a.load(&master).is_err());assert_eq!(ar.load().unwrap(),fork);
    fs::write(&master,b"partial").unwrap();assert!(a.load(&master).is_err());
    assert_eq!(Repository::open(&ac.database()).unwrap().load().unwrap()["settings"]["pinnedItems"],json!(["bbb","aaa"]));
}
#[test]
fn archive_mismatch_blocks_import() {
    let d = tempdir().unwrap();
    let mut m = library();
    archived(&mut m, d.path());
    let p = d.path().join("old.json");
    let raw = fs::read(&p).unwrap();
    m["archiveIndex"][0]["code"] = json!("009.412");
    assert!(stage_archives(&m, d.path(), &d.path().join("vault"), &Default::default()).is_err());
    assert_eq!(digest(&fs::read(&p).unwrap()), digest(&raw));
}

#[test]
fn complete_recovery_export_and_retained_backups() {
    use yutanohe_library::lifecycle::{backup_retained as backup, export_recovery};
    let d = tempdir().unwrap();
    let dir = d.path();
    let mut m = library();
    archived(&mut m, dir);
    let stage=dir.join("stage");fs::create_dir(&stage).unwrap();
    let inv=stage_archives(&m,dir,&stage.join("objects"),&Default::default()).unwrap();
    let mut r=Repository::create(&stage.join("library.sqlite"),&Uuid::new_v4().to_string(),None).unwrap();
    r.save_with_files(&m,None,"test",&inv).unwrap();
    let h = r.identity().unwrap().1.unwrap();
    m["items"][1]["content"] = json!("Edits after opening");
    r.save(&m, Some(&h), "device").unwrap();
    let out = export_recovery(&r, &stage.join("objects"), &dir.join("recovery")).unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(out).unwrap()).unwrap(),
        m
    );
    assert_eq!(
        fs::read(dir.join("old.json")).unwrap(),
        fs::read(dir.join("recovery/old.json")).unwrap()
    );
    for _ in 0..12 {
        backup(&r, &stage.join("backups"), &stage.join("objects"), true).unwrap()
    }
    assert_eq!(
        fs::read_dir(stage.join("backups"))
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("sqlite"))
            .count(),
        12
    );
    r.check().unwrap();
}

#[test]
fn linked_locations_survive_promotion_undo_and_backup() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("working.sqlite");
    let mut repo = Repository::create(&file, &Uuid::new_v4().to_string(), None).unwrap();
    let mut old = library();
    let mut destination = old["items"][1].clone();
    destination["id"] = json!("destination");
    destination["rootId"] = json!("001.008");
    destination["order"] = json!(8);
    old["items"].as_array_mut().unwrap().push(destination);
    let initial = repo.save(&old, None, "Mac").unwrap();
    let mut linked = old.clone();
    linked["schemaVersion"] = json!(11);
    linked["locations"] = json!({"second":{"item":"bbb","parent":"destination","order":1,"collapsed":false,"rootId":null}});
    let rev = repo.save(&linked, Some(&initial), "Mac").unwrap();
    repo.check().unwrap();
    let mut child = linked["items"][0].clone();
    child["id"] = json!("child");
    child["parentId"] = json!("bbb");
    child["locationParent"] = json!("second");
    child["order"] = json!(1);
    linked["items"].as_array_mut().unwrap().push(child);
    let rev = repo.save(&linked, Some(&rev), "Mac").unwrap();
    repo.snapshot(&dir.path().join("snapshot")).unwrap();
    assert_eq!(
        Repository::open(&dir.path().join("snapshot"))
            .unwrap()
            .load()
            .unwrap(),
        linked
    );
    let mut bad = linked.clone();
    bad["locations"]["second"]["parent"] = json!("child");
    assert!(repo.save(&bad, Some(&rev), "Mac").is_err());
    let mut promoted = linked.clone();
    promoted["items"][0]["locationId"] = json!("second");
    promoted["items"][0]["parentId"] = json!("destination");
    promoted["items"][0]["order"] = json!(1);
    promoted["items"][3]
        .as_object_mut()
        .unwrap()
        .remove("locationParent");
    promoted["locations"] = json!({});
    let next = repo.save(&promoted, Some(&rev), "Windows").unwrap();
    repo.check().unwrap();
    let undo = repo.save(&linked, Some(&next), "Windows").unwrap();
    assert_eq!(repo.load().unwrap(), linked);
    repo.save(&old, Some(&undo), "Windows").unwrap();
    drop(repo);
    assert_eq!(Repository::open(&file).unwrap().load().unwrap(), old);
}

#[test]
fn image_occurrences_share_original_after_sqlite_reopen() {
    use yutanohe_library::images::{read_original, store_original};
    let dir = tempdir().unwrap();
    let vault = dir.path().join("objects");
    let data = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
    let image = store_original(&vault, data, false).unwrap();
    let path = dir.path().join("library.sqlite");
    let mut repository = Repository::create(&path, &Uuid::new_v4().to_string(), None).unwrap();
    let mut model = library();
    model["imageAssets"][&image.hash] =
        json!({"extension":"svg","bytes":image.bytes,"name":"diagram.svg"});
    for (index, item) in model["items"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        item["content"] = json!(format!("![Diagram {index}](assets/{}.svg)", image.hash));
    }
    repository.save(&model, None, "desktop").unwrap();
    drop(repository);
    let reopened = Repository::open(&path).unwrap();
    reopened.check().unwrap();
    assert_eq!(reopened.load().unwrap(), model);
    assert_eq!(
        read_original(&vault, &image.hash, image.bytes as u64)
            .unwrap()
            .unwrap(),
        data
    );
    assert_eq!(fs::read_dir(vault).unwrap().count(), 1);
}

#[test]
fn images_verified_on_portable_backup_and_recovery() {
    use yutanohe_library::{images, lifecycle};
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    let vault = root.join("vault");
    let exchange = root.join("exchange");
    let original = include_bytes!("fixtures/images/pixel.gif");
    let image = images::store_original(&vault, original, false).unwrap();
    let mut model = library();
    archived(&mut model, root);
    // The only image reference is in an externally stored cold archive.
    let mut cold: Value =
        serde_json::from_slice(&fs::read(root.join("old.json")).unwrap()).unwrap();
    cold["items"][0]["content"] = json!(format!("![Archived](assets/{}.gif)", image.hash));
    fs::write(root.join("old.json"), serde_json::to_vec(&cold).unwrap()).unwrap();
    model["imageAssets"][&image.hash] =
        json!({"bytes":image.bytes,"extension":"gif","name":"pixel.gif"});
    let inv = stage_archives(&model, root, &vault, &Default::default()).unwrap();
    let mut repo = Repository::create(
        &root.join("source.sqlite"),
        &Uuid::new_v4().to_string(),
        None,
    )
    .unwrap();
    repo.save_with_files(&model, None, "sender", &inv).unwrap();
    let master=exchange.with_extension("ytnh");
    portable::create(&repo,&vault,&master,&root.join("stage"),Limits::default()).unwrap();
    let checked=portable::verify(&master,&root.join("check"),Limits::default()).unwrap();
    assert_eq!(fs::read(checked.objects().join(&image.hash)).unwrap(),original);
    assert_eq!(Repository::open(&checked.database()).unwrap().load().unwrap(),model);
    lifecycle::backup_retained(&repo, &root.join("backups"), &vault, true).unwrap();
    lifecycle::backup_retained(&repo, &root.join("backups"), &vault, true).unwrap();
    assert_eq!(
        fs::read(root.join("backups/objects").join(&image.hash)).unwrap(),
        original
    );
    let export = lifecycle::export_recovery(&repo, &vault, &root.join("recovery")).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(&export).unwrap()).unwrap(),model);
    assert_eq!(fs::read(root.join("recovery/assets").join(format!("{}.gif",image.hash))).unwrap(),original);
    fs::remove_file(vault.join(&image.hash)).unwrap();
    assert!(portable::create(&repo,&vault,&root.join("Missing.ytnh"),root,Limits::default()).is_err());
    assert!(lifecycle::export_recovery(&repo, &vault, &root.join("incomplete")).is_err());
    assert!(!root.join("incomplete/library.json").exists());
}

#[test]
fn planner_migration_is_atomic_and_survives_snapshot_and_undo() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("local.sqlite");
    let mut repo = Repository::create(&path, &Uuid::new_v4().to_string(), None).unwrap();
    let original = library();
    let base = repo.save(&original, None, "sender").unwrap();
    let mut planned = original.clone();
    let session = Uuid::new_v4().to_string();
    planned["planner"] =
        json!({"sessions":{}, "rules":{}, "meetings":{}, "sources":{}, "settings":{}});
    planned["planner"]["sessions"][&session] =
        json!({"item":"bbb","date":"2026-12-31","start":480,"duration":15});
    let head = repo.save(&planned, Some(&base), "sender").unwrap();
    repo.snapshot(&dir.path().join("snapshot.sqlite")).unwrap();
    assert_eq!(
        Repository::open(&dir.path().join("snapshot.sqlite"))
            .unwrap()
            .load()
            .unwrap(),
        planned
    );
    let mut invalid = planned.clone();
    invalid["planner"]["sessions"][&session]["item"] = json!("missing");
    assert!(repo.save(&invalid, Some(&head), "sender").is_err());
    assert_eq!(repo.load().unwrap(), planned);
    repo.save(&original, Some(&head), "sender").unwrap();
    assert_eq!(repo.load().unwrap(), original);
}

#[test]
fn planner_documents_and_images_travel_with_the_database() {
    use yutanohe_library::{images, lifecycle};
    let dir = tempdir().unwrap();
    let root = dir.path();
    let vault = root.join("vault");
    let bytes = include_bytes!("fixtures/images/pixel.gif");
    let image = images::store_original(&vault, bytes, false).unwrap();
    let mut m = library();
    archived(&mut m, root);
    let archives = stage_archives(&m, root, &vault, &Default::default()).unwrap();
    m["imageAssets"][&image.hash] =
        json!({"bytes":image.bytes,"extension":"gif","name":"test.gif"});
    let meeting = Uuid::new_v4().to_string();
    let source = Uuid::new_v4().to_string();
    m["planner"] = json!({"sessions":{}, "rules":{}, "meetings":{}, "sources":{}, "settings":{"start":420,"end":1140}});
    m["planner"]["sources"][&source] = json!({"name":"test","history":[]});
    m["planner"]["meetings"][&meeting] = json!({"id":meeting,"source":source,"uid":"fixture","parent":"cold1","title":"Test","content":format!("![Meeting](assets/{}.gif)",image.hash),"versions":[{"from":"2026-11-09","date":"2026-11-09","start":540,"end":600,"span":0,"zone":"UTC","enabled":true}],"exceptions":{},"coverage":{}});
    let mut repo = Repository::create(
        &root.join("active.sqlite"),
        &Uuid::new_v4().to_string(),
        None,
    )
    .unwrap();
    repo.save_with_files(&m,None,"A",&archives).unwrap();
    let master=root.join("Meeting.ytnh");portable::create(&repo,&vault,&master,&root.join("stage"),Limits::default()).unwrap();
    let checked=portable::verify(&master,&root.join("receive"),Limits::default()).unwrap();
    assert_eq!(Repository::open(&checked.database()).unwrap().load().unwrap(),m);
    assert_eq!(fs::read(checked.objects().join(&image.hash)).unwrap(),bytes);
    let backups = root.join("backups");
    lifecycle::backup_retained(&repo, &backups, &vault, true).unwrap();
    let backup = fs::read_dir(&backups)
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|s| s.to_str()) == Some("sqlite"))
        .unwrap();
    assert_eq!(Repository::open(&backup).unwrap().load().unwrap(), m);
    let recovery = root.join("recovery");
    let exported = lifecycle::export_recovery(&repo, &vault, &recovery).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(exported).unwrap()).unwrap(),m);
    assert_eq!(fs::read(recovery.join("assets").join(format!("{}.gif",image.hash))).unwrap(),bytes);
}

#[test]
fn resized_image_width_survives_sqlite_reopen() {
    let d = tempdir().unwrap();
    let path = d.path().join("image-width.sqlite");
    let mut model = library();
    let body = format!(r#"<img src="assets/{}.svg" alt="Fixture" width="436">"#, "a".repeat(64));
    model["items"][0]["content"] = json!(body);
    let mut repository = Repository::create(&path, &Uuid::new_v4().to_string(), None).unwrap();
    repository.save(&model, None, "fixture").unwrap();
    drop(repository);
    let restored = Repository::open(&path).unwrap().load().unwrap();
    assert_eq!(restored["items"][0]["content"], body);
}

#[test]
fn planner_validation_rejects_bad_schedules_without_changing_head() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::create(
        &dir.path().join("local.sqlite"),
        &Uuid::new_v4().to_string(),
        None,
    )
    .unwrap();
    let mut model = library();
    let id = Uuid::new_v4().to_string();
    model["planner"] = json!({"settings":{},"sources":{},"sessions":{},"rules":{},"meetings":{}});
    model["planner"]["meetings"][&id] = json!({"id":id,"title":"Meeting","content":"Keep document","versions":[{"from":"2026-11-09","date":"2026-11-09","start":540,"end":600,"span":0,"zone":"UTC","enabled":true,
      "recurrence":{"frequency":"weekly","interval":1,"startDate":"2026-11-09","weekDays":[1]},
      "localOverride":{"date":"2026-11-10","offset":1}}],"exceptions":{"2026-11-16":{"date":"2026-11-18","start":550}}});
    let head = repo.save(&model, None, "test").unwrap();
    for (field, value) in [
        ("start", json!(null)),
        ("start", json!(1440)),
        ("end", json!(500)),
        ("span", json!(-1)),
        ("date", json!("2026-02-30")),
        ("zone", json!("")),
        ("enabled", json!("yes")),
        ("localOverride", json!({"offset":0.5})),
    ] {
        let mut bad = model.clone();
        bad["planner"]["meetings"][&id]["versions"][0][field] = value;
        assert!(repo.save(&bad, Some(&head), "test").is_err(), "{field}");
        assert_eq!(repo.load().unwrap(), model);
        assert_eq!(repo.identity().unwrap().1.as_deref(), Some(head.as_str()));
    }
    let reopened = Repository::open(&dir.path().join("local.sqlite")).unwrap();
    assert_eq!(reopened.load().unwrap(), model);
}
