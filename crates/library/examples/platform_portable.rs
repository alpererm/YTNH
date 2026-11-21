//! Synthetic CI round trip of the portable master. No application handoff protocol.
use std::{fs, path::PathBuf};
use serde_json::{json, Value};
use yutanohe_library::{images, lifecycle, portable::{self, Limits, WorkingStore}, transfer, Repository, Result};
fn main() -> Result<()> {
    let mut args=std::env::args().skip(1);
    let mode=args.next().ok_or("missing step")?;
    let parcel=PathBuf::from(args.next().ok_or("missing parcel directory")?);
    let local=tempfile::tempdir()?;let work=local.path();
    let master=parcel.join("Library.ytnh");
    match mode.as_str() {
        "send" => {
            fs::create_dir_all(&parcel)?;
            let mut model:Value=serde_json::from_slice(include_bytes!("../tests/fixtures/library.json"))?;
            fs::write(work.join("cold-archive.json"),include_bytes!("../tests/fixtures/cold-archive.json"))?;
            let vault=work.join("objects");
            let image=images::store_original(&vault,include_bytes!("../tests/fixtures/images/pixel.gif"),false)?;
            model["items"][0]["content"]=json!(format!("<img src=\"assets/{}.gif\" width=\"240\" alt=\"Portable CI\">",image.hash));
            model["imageAssets"][&image.hash]=json!({"bytes":image.bytes,"extension":"gif","name":"pixel.gif"});
            let inventory=transfer::stage_archives(&model,work,&vault,&Default::default())?;
            let mut repo=Repository::create(&work.join("source.sqlite"),&uuid::Uuid::new_v4().to_string(),None)?;
            repo.save_with_files(&model,None,"sender",&inventory)?;
            portable::create(&repo,&vault,&master,&work.join("stage"),Limits::default())?;
            fs::copy(&master,parcel.join("Baseline.ytnh"))?;
            fs::write(parcel.join("expected.json"),serde_json::to_vec(&model)?)?;
        },
        "reply" => {
            let store=WorkingStore::open(&work.join("receiver"),Limits::default())?;
            let copy=store.load(&master)?;let mut repo=Repository::open(&copy.database())?;
            let mut model=repo.load()?;
            assert_eq!(model,serde_json::from_slice::<Value>(&fs::read(parcel.join("expected.json"))?)?);
            model["schemaVersion"]=json!(11);
            model["locations"]=json!({"test-location":{"item":model["items"][0]["id"],"parent":null,"order":4,"rootId":"001.004","collapsed":false}});
            model["nextRootOrdinal"]=json!(5);model["items"][0]["title"]=json!("Verified receiver edit");
            let revision=repo.save(&model,repo.identity()?.1.as_deref(),"receiver")?;
            store.publish(&copy.session.library,&revision,None)?;
        },
        "verify" => {
            let store=WorkingStore::open(&work.join("return"),Limits::default())?;
            let baseline=store.load(&parcel.join("Baseline.ytnh"))?;
            let returned=store.load(&master)?;assert_eq!(baseline.session.library,returned.session.library);
            let repo=Repository::open(&returned.database())?;let model=repo.load()?;
            assert_eq!(model["items"][0]["title"],"Verified receiver edit");
            assert_eq!(model["locations"]["test-location"]["item"],model["items"][0]["id"]);
            assert!(model["items"][0]["content"].as_str().unwrap().contains("width=\"240\""));
            lifecycle::export_recovery(&repo,&returned.objects(),&work.join("recovery"))?;
            assert_eq!(fs::read(work.join("recovery/cold-archive.json"))?,include_bytes!("../tests/fixtures/cold-archive.json"));
            let hash=model["imageAssets"].as_object().unwrap().keys().next().unwrap();
            assert_eq!(fs::read(work.join("recovery/assets").join(format!("{hash}.gif")))?,include_bytes!("../tests/fixtures/images/pixel.gif"));
            assert!(store.load(&parcel.join("Baseline.ytnh")).is_err());
        },
        _=>return Err("Unknown step".into()),
    }
    println!("Verified portable {mode} on {}",std::env::consts::OS);Ok(())
}
