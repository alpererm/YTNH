//! Local library repository. Paths and device identity are supplied by the host.
pub mod images;
pub mod lifecycle;
mod locations;
mod planner;
pub mod portable;
pub mod transfer;
use rusqlite::{params, Connection};
use serde_json::{json, Map, Value as V};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
type Obj = Map<String, V>;
const ARRAYS: &[&str] = &[
    "scheduledDates",
    "explicitTags",
    "codeAliases",
    "tagExclusions",
];
pub fn canonical(value: &V) -> Vec<u8> {
    let mut ordered = value.clone();
    ordered.sort_all_objects();
    ordered.to_string().into_bytes()
}
pub fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}
fn object(v: &V) -> Result<&Obj> {
    v.as_object().ok_or_else(|| "Expected an object".into())
}
fn array(v: &V) -> Result<&Vec<V>> {
    v.as_array().ok_or_else(|| "Expected an array".into())
}
fn string(v: &V) -> Result<&str> {
    v.as_str().ok_or_else(|| "Expected a string".into())
}
fn take(o: &mut Obj, key: &str) -> Result<V> {
    o.remove(key).ok_or_else(|| format!("Missing {key}").into())
}
fn encode(o: Obj) -> String {
    V::Object(o).to_string()
}
fn decode(s: String) -> rusqlite::Result<V> {
    serde_json::from_str(&s).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

pub struct Repository {
    conn: Connection,
}
impl Repository {
    pub fn create(path: &Path, library: &str, source_hash: Option<&str>) -> Result<Self> {
        // Reserve a new destination; never initialize over an existing database.
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        let mut conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")?;
        let tx = conn.transaction()?;
        tx.execute_batch(include_str!("schema.sql"))?;
        tx.execute(
            "INSERT INTO library VALUES(1,?1,NULL,?2)",
            params![library, source_hash],
        )?;
        tx.commit()?;
        Ok(Self { conn })
    }
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)?;
        conn.execute_batch(
            "PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;",
        )?;
        if conn.query_row("PRAGMA application_id", [], |r| r.get::<_, i64>(0))? != 1498697288
            || !matches!(
                conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?,
                1..=3
            )
        {
            return Err("Unsupported library format".into());
        }
        Ok(Self { conn })
    }
    pub fn contains_commit(&self, id: &str, hash: &str) -> Result<bool> {
        Ok(self
            .conn
            .prepare("SELECT 1 FROM commits WHERE id=? AND model_hash=?")?
            .exists(params![id, hash])?)
    }
    pub fn identity(&self) -> Result<(String, Option<String>)> {
        Ok(self
            .conn
            .query_row("SELECT id,head FROM library", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?)
    }
    pub fn library_metadata(&self, key: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        Ok(self
            .conn
            .query_row("SELECT value FROM metadata WHERE key=?", [key], |r| {
                r.get(0)
            })
            .optional()?)
    }
    /// Items written after `base`, or None when `base` is not part of this history.
    pub fn items_changed_since(&self, base: &str) -> Result<Option<Vec<String>>> {
        use rusqlite::OptionalExtension;
        let generation: Option<i64> = self
            .conn
            .query_row("SELECT generation FROM commits WHERE id=?", [base], |r| r.get(0))
            .optional()?;
        let Some(generation) = generation else { return Ok(None) };
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT c.id FROM changes c JOIN commits m ON m.id=c.commit_id \
             WHERE c.entity='item' AND c.deleted=0 AND m.generation>? ORDER BY c.id",
        )?;
        let ids = stmt
            .query_map([generation], |r| r.get(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;
        Ok(Some(ids))
    }
    pub fn archive_index(&self) -> Result<V> {
        read_archive_index(&self.conn)
    }
    pub fn load(&self) -> Result<V> {
        read_model(&self.conn)
    }
    pub fn check(&self) -> Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA integrity_check")?;
        let messages = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if messages != ["ok"] || self.conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
            return Err("Library integrity check failed".into());
        }
        if let Some(head) = self.identity()?.1 {
            let malformed=self.conn.prepare("SELECT 1 FROM commits c LEFT JOIN commits p ON p.id=c.parent WHERE c.generation<1 OR c.device='' OR (c.generation=1)!=(c.parent IS NULL) OR (c.parent IS NOT NULL AND p.generation!=c.generation-1) LIMIT 1")?.exists([])?;
            let tip: String = self.conn.query_row(
                "SELECT id FROM commits ORDER BY generation DESC LIMIT 1",
                [],
                |r| r.get(0),
            )?;
            if malformed || tip != head {
                return Err("Invalid library revision history".into());
            }
            let model = self.load()?;
            validate(&model)?;
            let count: i64 = self
                .conn
                .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))?;
            if count as usize != array(&model["items"])?.len() {
                return Err("An item lacks its primary placement".into());
            }
            if transfer::archive_names(&model)?
                .keys()
                .ne(self.inventory()?.keys())
            {
                return Err("Incomplete archive inventory".into());
            }
            let hash: String =
                self.conn
                    .query_row("SELECT model_hash FROM commits WHERE id=?", [head], |r| {
                        r.get(0)
                    })?;
            if digest(&canonical(&json!([model, self.inventory()?]))) != hash {
                return Err("Library content does not match its revision".into());
            }
        }
        Ok(())
    }
    pub fn save(&mut self, model: &V, expected: Option<&str>, device: &str) -> Result<String> {
        let files = self.inventory()?;
        self.save_with_files(model, expected, device, &files)
    }
    pub fn save_with_files(
        &mut self,
        model: &V,
        expected: Option<&str>,
        device: &str,
        files: &transfer::Inventory,
    ) -> Result<String> {
        validate(model)?;
        let names = transfer::archive_names(model)?;
        if names.keys().ne(files.keys()) {
            return Err("Every cold archive must be verified before saving".into());
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let head: Option<String> = tx.query_row("SELECT head FROM library", [], |r| r.get(0))?;
        if expected != head.as_deref() {
            return Err("Conflict: local revision changed".into());
        }
        let hash = digest(&canonical(&json!([model, files])));
        if let Some(ref h) = head {
            let prior: String =
                tx.query_row("SELECT model_hash FROM commits WHERE id=?", [h], |r| {
                    r.get(0)
                })?;
            if prior == hash {
                return Ok(h.clone());
            }
        }
        let rev = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO commits SELECT ?1,?2,?3,COALESCE(MAX(generation),0)+1,?4 FROM commits",
            params![rev, head, device, hash],
        )?;
        let before = if head.is_some() {
            read_model(&tx)?
        } else {
            json!({"items":[]})
        };
        let prior: HashMap<&str, &V> = array(&before["items"])?
            .iter()
            .map(|i| Ok((string(&i["id"])?, i)))
            .collect::<Result<_>>()?;
        let mut places: HashMap<String, String> = tx
            .prepare("SELECT item,placement FROM placement_keys")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        let items = array(&model["items"])?;
        let active: HashSet<_> = items
            .iter()
            .map(|i| string(&i["id"]))
            .collect::<Result<_>>()?;
        for id in &active {
            if !places.contains_key(*id) {
                let placement = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO placement_keys VALUES(?,?)",
                    params![id, placement],
                )?;
                places.insert(id.to_string(), placement);
            }
        }
        let mut portable = HashMap::new();
        let mut physical = places.clone();
        for item in items {
            let id = string(&item["id"])?;
            let sql = locations::primary_sql(item, &places)?;
            portable.insert(
                string(item.get("locationId").unwrap_or(&item["id"]))?.to_owned(),
                sql.clone(),
            );
            physical.insert(id.to_owned(), sql);
        }
        let empty = Obj::new();
        let extra = model["locations"].as_object().unwrap_or(&empty);
        let old_extra = before["locations"].as_object().unwrap_or(&empty);
        for id in extra.keys() {
            portable.insert(id.clone(), format!("linked:{id}"));
        }
        for (id, old) in &prior {
            let old_sql = locations::primary_sql(old, &places)?;
            if active.contains(id) && physical[*id] != old_sql {
                tx.execute("DELETE FROM placements WHERE id=?", [&old_sql])?;
                tx.execute(
                    "INSERT OR REPLACE INTO changes VALUES(?,'placement',?,1)",
                    params![rev, old_sql],
                )?;
            }
        }
        for (id, old) in old_extra {
            if extra.get(id) == Some(old) {
                continue;
            }
            let sql = format!("linked:{id}");
            tx.execute("DELETE FROM placements WHERE id=?", [&sql])?;
            tx.execute(
                "INSERT OR REPLACE INTO changes VALUES(?,'placement',?,1)",
                params![rev, sql],
            )?;
        }
        for id in prior.keys().filter(|id| !active.contains(**id)) {
            tx.execute("DELETE FROM items WHERE id=?", [id])?;
            tx.execute("INSERT INTO changes VALUES(?,'item',?,1)", params![rev, id])?;
            tx.execute(
                "INSERT INTO changes VALUES(?,'placement',?,1)",
                params![rev, locations::primary_sql(prior[*id], &places)?],
            )?;
        }
        // Clear the unique root slot before reassignment (undo and hierarchy moves).
        for item in items {
            let id = string(&item["id"])?;
            if prior
                .get(id)
                .is_some_and(|old| old["rootId"] != item["rootId"])
            {
                tx.execute(
                    "UPDATE placements SET root_code=NULL WHERE id=?",
                    [&physical[id]],
                )?;
            }
        }
        for (n, item) in items.iter().enumerate() {
            let id = string(&item["id"])?;
            if prior.get(id) == Some(&item) {
                tx.execute(
                    "UPDATE items SET sequence=? WHERE id=? AND sequence<>?",
                    params![n as i64, id, n as i64],
                )?;
                continue;
            }
            write_item(&tx, item, n as i64, &physical, &portable)?;
            tx.execute("INSERT INTO changes VALUES(?,'item',?,0)", params![rev, id])?;
            tx.execute(
                "INSERT OR REPLACE INTO changes VALUES(?,'placement',?,0)",
                params![rev, physical[id]],
            )?;
        }
        for (id, p) in extra {
            if old_extra.get(id) == Some(p) {
                continue;
            }
            let key = &portable[id];
            tx.execute(
                "INSERT INTO placements VALUES(?,?,?,?,?,?)",
                params![
                    key,
                    p["item"].as_str(),
                    p["parent"].as_str().map(|s| &portable[s]),
                    p["order"].as_i64(),
                    p["rootId"].as_str(),
                    p["collapsed"].as_bool()
                ],
            )?;
            tx.execute(
                "INSERT OR REPLACE INTO changes VALUES(?,'placement',?,0)",
                params![rev, key],
            )?;
        }
        if model["imageAssets"]
            .as_object()
            .is_some_and(|m| !m.is_empty())
        {
            // Earlier desktop versions cannot protect external images during transfers.
            if tx.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 2 {
                tx.pragma_update(None, "user_version", 2)?;
            }
        }
        write_metadata(&tx, model)?;
        planner::write(&tx, &before, model)?;
        tx.execute("DELETE FROM files WHERE kind='archive'", [])?;
        for (id, (hash, len)) in files {
            tx.execute(
                "INSERT INTO files VALUES(?,'archive',?,?)",
                params![id, hash, len],
            )?;
        }
        tx.execute(
            "INSERT INTO changes VALUES(?,'library',(SELECT id FROM library),0)",
            [&rev],
        )?;
        tx.execute("UPDATE library SET head=?", [&rev])?;
        if read_model(&tx)? != *model {
            return Err("Round-trip verification failed; transaction cancelled".into());
        }
        tx.commit()?;
        Ok(rev)
    }
    pub fn snapshot(&self, out: &Path) -> Result<()> {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(out)?;
        let mut dest = Connection::open(out)?;
        rusqlite::backup::Backup::new(&self.conn, &mut dest)?.run_to_completion(
            128,
            std::time::Duration::from_millis(2),
            None,
        )?;
        drop(dest);
        Self::open(out)?.check()
    }
}

fn validate(model: &V) -> Result<()> {
    if model["format"] != "local-notes-todos"
        || !matches!(model["schemaVersion"].as_i64(), Some(9 | 10 | 11))
    {
        return Err("Unsupported JSON library".into());
    }
    locations::validate(model)?;
    let mut by_id = HashMap::new();
    let mut orders = HashSet::new();
    let mut roots = HashSet::new();
    for i in array(&model["items"])? {
        let id = string(&i["id"])?;
        if id.is_empty() || by_id.insert(id, i).is_some() {
            return Err("Duplicate or empty item ID".into());
        }
        let order = i["order"]
            .as_i64()
            .filter(|n| *n > 0)
            .ok_or("Invalid sibling order")?;
        if model["schemaVersion"] != 11
            && i["archived"] == false
            && !orders.insert((i["parentId"].as_str(), order))
        {
            return Err("Duplicate sibling order".into());
        }
        if i["parentId"].is_null() {
            if !roots.insert(string(&i["rootId"])?) {
                return Err("Duplicate root code".into());
            }
        } else if !i["rootId"].is_null() {
            return Err("Child has root code".into());
        }
    }
    for i in by_id.values() {
        let mut node = *i;
        let mut depth = 0;
        while !node["parentId"].is_null() {
            node = *by_id
                .get(string(&node["parentId"])?)
                .ok_or("Missing parent")?;
            depth += 1;
            if depth >= 256 {
                return Err("Cycle or excessive hierarchy depth".into());
            }
            if i["archived"] == false && node["archived"] == true {
                return Err("Archived ancestor of live item".into());
            }
        }
    }
    Ok(())
}

fn write_item(
    c: &Connection,
    i: &V,
    n: i64,
    places: &HashMap<String, String>,
    portable: &HashMap<String, String>,
) -> Result<()> {
    let mut extra = object(i)?.clone();
    let id = string(&i["id"])?;
    for k in [
        "id",
        "type",
        "title",
        "content",
        "status",
        "createdAt",
        "updatedAt",
        "archived",
        "parentId",
        "order",
        "rootId",
        "collapsed",
    ] {
        extra.remove(k);
    }
    for &k in ARRAYS {
        if extra.contains_key(k) {
            extra.insert(k.into(), json!([]));
        }
    }
    for k in ["target", "milestone", "recurrence", "occurrenceStates"] {
        if i[k].is_object() {
            extra.remove(k);
        }
    }
    c.execute("INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,body=excluded.body,status=excluded.status,created=excluded.created,updated=excluded.updated,archived=excluded.archived,sequence=excluded.sequence,extras=excluded.extras",
 params![id,string(&i["type"])?,string(&i["title"])?,string(&i["content"])?,string(&i["status"])?,string(&i["createdAt"])?,string(&i["updatedAt"])?,i["archived"].as_bool().ok_or("Invalid archived flag")?,n,encode(extra)])?;
    let parent = if let Some(id) = i["locationParent"].as_str() {
        Some(portable.get(id).ok_or("Missing parent location")?)
    } else if i["parentId"].is_null() {
        None
    } else {
        Some(&places[string(&i["parentId"])?])
    };
    c.execute("INSERT INTO placements VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent=excluded.parent,ordering=excluded.ordering,root_code=excluded.root_code,collapsed=excluded.collapsed",params![places[id],id,parent,i["order"].as_i64(),i["rootId"].as_str(),i["collapsed"].as_bool().ok_or("Invalid collapsed flag")?])?;
    for table in [
        "item_values",
        "occurrence_states",
        "targets",
        "milestones",
        "recurrence",
    ] {
        c.execute(&format!("DELETE FROM {table} WHERE item=?"), [id])?;
    }
    for &field in ARRAYS {
        if let Some(v) = i.get(field) {
            for (index, v) in array(v)?.iter().enumerate() {
                c.execute(
                    "INSERT INTO item_values VALUES(?,?,?,?)",
                    params![id, field, index as i64, string(v)?],
                )?;
            }
        }
    }
    for (day, status) in object(&i["occurrenceStates"])? {
        c.execute(
            "INSERT INTO occurrence_states VALUES(?,?,?)",
            params![id, day, string(status)?],
        )?;
    }
    if let Some(v) = i["target"].as_object() {
        let mut o = v.clone();
        let a = take(&mut o, "startMonth")?;
        let b = take(&mut o, "endMonth")?;
        c.execute(
            "INSERT INTO targets VALUES(?,?,?,?)",
            params![id, string(&a)?, string(&b)?, encode(o)],
        )?;
    }
    if let Some(v) = i["milestone"].as_object() {
        let mut o = v.clone();
        let a = take(&mut o, "targetWeek")?;
        c.execute(
            "INSERT INTO milestones VALUES(?,?,?)",
            params![id, string(&a)?, encode(o)],
        )?;
    }
    if let Some(v) = i["recurrence"].as_object() {
        let mut o = v.clone();
        let f = take(&mut o, "frequency")?;
        let n = take(&mut o, "interval")?;
        let d = take(&mut o, "startDate")?;
        c.execute(
            "INSERT INTO recurrence VALUES(?,?,?,?,?)",
            params![id, string(&f)?, n.as_i64(), string(&d)?, encode(o)],
        )?;
    }
    Ok(())
}
fn write_metadata(c: &Connection, m: &V) -> Result<()> {
    for table in ["metadata", "settings", "link_aliases", "archive_index"] {
        c.execute(&format!("DELETE FROM {table}"), [])?;
    }
    for (k, v) in object(m)? {
        match k.as_str() {
            "items" | "locations" | "planner" => (),
            "settings" => {
                for (k, v) in object(v)? {
                    c.execute(
                        "INSERT INTO settings VALUES(?,?)",
                        params![k, v.to_string()],
                    )?;
                }
            }
            "linkAliases" => {
                for (k, v) in object(v)? {
                    c.execute(
                        "INSERT INTO link_aliases VALUES(?,?)",
                        params![k, string(v)?],
                    )?;
                }
            }
            "archiveIndex" => {
                for (n, v) in array(v)?.iter().enumerate() {
                    let mut o = object(v)?.clone();
                    let id = take(&mut o, "id")?;
                    let path = take(&mut o, "archiveFile")?;
                    c.execute(
                        "INSERT INTO archive_index VALUES(?,?,?,?,?)",
                        params![
                            string(&id)?,
                            v["archiveId"].as_str().unwrap_or(""),
                            string(&path)?,
                            n as i64,
                            encode(o)
                        ],
                    )?;
                }
            }
            _ => {
                c.execute(
                    "INSERT INTO metadata VALUES(?,?)",
                    params![k, v.to_string()],
                )?;
            }
        }
    }
    Ok(())
}
fn read_archive_index(c: &Connection) -> Result<V> {
    let mut entries = Vec::new();
    let mut stmt =
        c.prepare("SELECT item,filename,metadata FROM archive_index ORDER BY position")?;
    let mut rows = stmt.query([])?;
    while let Some(r) = rows.next()? {
        let mut i = decode(r.get(2)?)?;
        i["id"] = json!(r.get::<_, String>(0)?);
        i["archiveFile"] = json!(r.get::<_, String>(1)?);
        entries.push(i);
    }
    Ok(V::Array(entries))
}
fn read_model(c: &Connection) -> Result<V> {
    let mut m = json!({"items":[],"settings":{},"linkAliases":{},"archiveIndex":[]});
    for table in ["metadata", "settings", "link_aliases"] {
        let mut stmt = c.prepare(&format!("SELECT * FROM {table}"))?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let k: String = r.get(0)?;
            let v: String = r.get(1)?;
            match table {
                "metadata" => m[k] = decode(v)?,
                "settings" => m["settings"][k] = decode(v)?,
                _ => m["linkAliases"][k] = json!(v),
            }
        }
    }
    planner::read(c, &mut m)?;
    m["archiveIndex"] = read_archive_index(c)?;
    let mut stmt=c.prepare("SELECT i.*,p.ordering,p.root_code,p.collapsed,pp.item FROM items i JOIN placement_keys k ON k.item=i.id JOIN placements p ON p.id=COALESCE('linked:'||json_extract(i.extras,'$.locationId'),k.placement) AND p.item=i.id LEFT JOIN placements pp ON pp.id=p.parent ORDER BY i.sequence")?;
    let mut rows = stmt.query([])?;
    let mut positions = HashMap::new();
    let mut items = Vec::new();
    while let Some(r) = rows.next()? {
        let mut i = decode(r.get(9)?)?;
        for (n, k) in [
            "id",
            "type",
            "title",
            "content",
            "status",
            "createdAt",
            "updatedAt",
        ]
        .iter()
        .enumerate()
        {
            i[*k] = json!(r.get::<_, String>(n)?);
        }
        i["archived"] = json!(r.get::<_, bool>(7)?);
        i["order"] = json!(r.get::<_, i64>(10)?);
        i["rootId"] = json!(r.get::<_, Option<String>>(11)?);
        i["collapsed"] = json!(r.get::<_, bool>(12)?);
        i["parentId"] = json!(r.get::<_, Option<String>>(13)?);
        i["occurrenceStates"] = json!({});
        if positions
            .insert(string(&i["id"])?.to_owned(), items.len())
            .is_some()
        {
            return Err("This version requires one placement per item".into());
        }
        items.push(i);
    }
    for table in [
        "item_values",
        "occurrence_states",
        "targets",
        "milestones",
        "recurrence",
    ] {
        let sql = if table == "item_values" {
            "SELECT * FROM item_values ORDER BY item,field,position".into()
        } else {
            format!("SELECT * FROM {table}")
        };
        let mut stmt = c.prepare(&sql)?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let id: String = r.get(0)?;
            let i = &mut items[*positions.get(&id).ok_or("Missing item")?];
            let a: String = r.get(1)?;
            match table {
                "item_values" => i[a]
                    .as_array_mut()
                    .ok_or("Invalid list")?
                    .push(json!(r.get::<_, String>(3)?)),
                "occurrence_states" => i["occurrenceStates"][a] = json!(r.get::<_, String>(2)?),
                "targets" => {
                    let mut o = decode(r.get(3)?)?;
                    o["startMonth"] = json!(a);
                    o["endMonth"] = json!(r.get::<_, String>(2)?);
                    i["target"] = o
                }
                "milestones" => {
                    let mut o = decode(r.get(2)?)?;
                    o["targetWeek"] = json!(a);
                    i["milestone"] = o
                }
                _ => {
                    let mut o = decode(r.get(4)?)?;
                    o["frequency"] = json!(a);
                    o["interval"] = json!(r.get::<_, i64>(2)?);
                    o["startDate"] = json!(r.get::<_, String>(3)?);
                    i["recurrence"] = o
                }
            }
        }
    }
    m["items"] = V::Array(items);
    locations::read(c, &mut m)?;
    Ok(m)
}

#[cfg(test)]
mod digest_format {
    // Stored fingerprints must stay lowercase hex across sha2 upgrades.
    #[test]
    fn digest_is_lowercase_hex_sha256() {
        assert_eq!(
            super::digest(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
