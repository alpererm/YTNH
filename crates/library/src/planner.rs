use super::{decode, object, Connection, Result, V};
use rusqlite::params;
use serde_json::json;

const RECORDS: [(&str, &str); 4] = [
    ("sessions", "planner_sessions"),
    ("rules", "planner_rules"),
    ("sources", "planner_sources"),
    ("meetings", "planner_meetings"),
];

pub fn read(conn: &Connection, model: &mut V) -> Result<()> {
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 3 {
        return Ok(());
    }
    let mut state = conn.prepare("SELECT settings FROM planner_state")?;
    let Some(settings) = state
        .query_map([], |r| decode(r.get(0)?))?
        .next()
        .transpose()?
    else {
        return Ok(());
    };
    let mut planner = json!({"settings":settings});
    for (key, table) in RECORDS {
        planner[key] = json!({});
        let mut query = conn.prepare(&format!("SELECT id, payload FROM {table}"))?;
        let mut rows = query.query([])?;
        while let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            planner[key][id] = decode(row.get(1)?)?;
        }
    }
    validate(&planner)?;
    model["planner"] = planner;
    Ok(())
}

pub fn write(conn: &Connection, before: &V, model: &V) -> Result<()> {
    let planner = &model["planner"];
    let prior = &before["planner"];
    if !planner.is_null() {
        validate(planner)?;
    }
    if planner.is_null() && prior.is_null() {
        return Ok(());
    }
    let version = conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))?;
    if version < 3 {
        conn.execute_batch(include_str!("planner.sql"))?;
    }
    // Meeting rows can reference sources. Remove dependent rows first.
    for (key, table) in RECORDS.into_iter().rev() {
        if let Some(records) = prior[key].as_object() {
            let mut remove = conn.prepare(&format!("DELETE FROM {table} WHERE id=?"))?;
            for id in records.keys().filter(|id| planner[key].get(*id).is_none()) {
                remove.execute([id])?;
            }
        }
    }
    if !planner.is_null() {
        object(&planner["settings"])?;
        if planner["settings"] != prior["settings"] {
            conn.execute(
                "INSERT OR REPLACE INTO planner_state VALUES(1,?)",
                [planner["settings"].to_string()],
            )?;
        }
        let mut add = conn.prepare("INSERT OR IGNORE INTO planner_item_keys VALUES(?)")?;
        for (key, table) in RECORDS {
            let mut write = conn.prepare(&format!("INSERT INTO {table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload"))?;
            for (id, record) in object(&planner[key])? {
                if prior[key].get(id) == Some(record) {
                    continue;
                }
                object(record)?;
                uuid::Uuid::parse_str(id)?;
                if let Some(reference) = record
                    .get(if key == "meetings" { "parent" } else { "item" })
                    .and_then(V::as_str)
                {
                    if !conn.query_row("SELECT EXISTS(SELECT 1 FROM items WHERE id=?1 UNION ALL SELECT 1 FROM archive_index WHERE item=?1)",[reference],|r|r.get::<_,bool>(0))? {
                        return Err("Planner refers to an unavailable item".into());
                    }
                    add.execute([reference])?;
                }
                write.execute(params![id, record.to_string()])?;
            }
        }
    } else {
        conn.execute("DELETE FROM planner_state", [])?;
    }
    // A left-over reference will fail its foreign key and roll back the whole save.
    conn.execute("DELETE FROM planner_item_keys WHERE NOT EXISTS(SELECT 1 FROM items WHERE items.id=planner_item_keys.id) AND NOT EXISTS(SELECT 1 FROM archive_index WHERE archive_index.item=planner_item_keys.id)",[])?;
    Ok(())
}

// Validate before writing and after loading. Unknown extension fields remain intact.
// Full IANA-zone/custom-rule interpretation belongs to the shared JS model; this
// platform-independent boundary checks shape, finite times and valid civil dates.
fn date(v: &V) -> bool {
    let Some(s) = v.as_str() else { return false };
    let b = s.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || b.iter()
            .enumerate()
            .any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit())
    {
        return false;
    }
    let y = s[..4].parse::<u32>().unwrap_or(0);
    let m = s[5..7].parse::<u32>().unwrap_or(0);
    let d = s[8..].parse::<u32>().unwrap_or(0);
    let max = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    y > 0 && d > 0 && d <= max
}
fn bounded(v: &V, min: i64, max: i64) -> bool {
    v.as_i64().is_some_and(|n| n >= min && n <= max)
}
fn require(ok: bool, field: &str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid Daily Planner record: {field}").into())
    }
}
fn flags(v: &V) -> Result<()> {
    for k in ["enabled", "done", "removed", "allDay", "postponed"] {
        require(v.get(k).is_none() || v[k].is_boolean(), k)?;
    }
    Ok(())
}
fn recurrence(v: &V) -> Result<()> {
    object(v)?;
    require(
        matches!(
            v["frequency"].as_str(),
            Some("daily" | "weekdays" | "weekly" | "monthly")
        ) && bounded(&v["interval"], 1, 9_007_199_254_740_991)
            && date(&v["startDate"]),
        "recurrence",
    )?;
    if let Some(days) = v.get("weekDays") {
        let days = days.as_array().ok_or("Invalid Planner weekdays")?;
        let unique: std::collections::HashSet<_> = days.iter().filter_map(V::as_i64).collect();
        require(
            !days.is_empty() && unique.len() == days.len() && days.iter().all(|d| bounded(d, 0, 6)),
            "weekdays",
        )?;
    }
    if let Some(day) = v.get("dayOfMonth") {
        require(bounded(day, 1, 31), "monthly day")?
    }
    if let Some(mode) = v.get("monthlyMode") {
        require(
            matches!(mode.as_str(), Some("date" | "relative")),
            "monthly pattern",
        )?
    }
    if v["monthlyMode"] == "relative" {
        let kind = v["dayKind"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| v["dayKind"].to_string());
        require(
            matches!(v["ordinal"].as_i64(), Some(-1 | 1 | 2 | 3 | 4))
                && [
                    "day", "weekday", "weekend", "0", "1", "2", "3", "4", "5", "6",
                ]
                .contains(&kind.as_str()),
            "relative month",
        )?;
    }
    Ok(())
}
fn session(v: &V) -> Result<()> {
    require(
        bounded(&v["start"], 0, 1439) && bounded(&v["duration"], 15, 1440),
        "session time",
    )?;
    require(
        v["start"].as_i64().unwrap() + v["duration"].as_i64().unwrap() <= 1440,
        "session end",
    )?;
    if let Some(d) = v.get("occurrence") {
        require(date(d), "occurrence date")?
    }
    flags(v)
}
fn meeting(v: &V) -> Result<()> {
    object(v)?;
    require(
        date(&v["date"])
            && bounded(&v["start"], 0, 1439)
            && bounded(&v["end"], 0, 1440)
            && bounded(&v["span"], 0, 3_652_058),
        "meeting dates/times",
    )?;
    require(
        v["span"].as_i64().unwrap() > 0 || v["end"].as_i64() >= v["start"].as_i64(),
        "meeting end",
    )?;
    require(
        v["allDay"] != true || v["span"].as_i64().unwrap() > 0,
        "all-day span",
    )?;
    require(
        v["zone"].as_str().is_some_and(|z| {
            !z.trim().is_empty()
                && z.len() <= 128
                && z.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"/_+-:".contains(&c))
        }),
        "time zone",
    )?;
    if !v["until"].is_null() {
        require(date(&v["until"]), "recurrence end")?
    }
    if !v["recurrence"].is_null() {
        recurrence(&v["recurrence"])?
    }
    if !v["custom"].is_null() {
        require(
            v["custom"]
                .as_str()
                .is_some_and(|s| s.is_empty() || s.starts_with("FREQ=")),
            "custom rule",
        )?
    }
    if let Some(offset) = v.get("offset") {
        require(
            bounded(offset, -9_007_199_254_740_991, 9_007_199_254_740_991),
            "offset",
        )?
    }
    flags(v)
}
fn merged(base: &V, values: &V) -> Result<V> {
    let mut result = base.clone();
    for (k, v) in object(values)? {
        result[k] = v.clone();
    }
    Ok(result)
}
fn versions(record: &V, is_meeting: bool) -> Result<()> {
    let vs = record["versions"]
        .as_array()
        .ok_or("Invalid Planner versions")?;
    require(!vs.is_empty(), "missing versions")?;
    let mut prior = "";
    for v in vs {
        require(
            date(&v["from"]) && v["from"].as_str().unwrap_or("") > prior,
            "version order",
        )?;
        prior = v["from"].as_str().unwrap();
        if is_meeting {
            meeting(v)?;
            if !v["localOverride"].is_null() {
                meeting(&merged(v, &v["localOverride"])?)?
            }
        } else {
            session(v)?;
            recurrence(&v["recurrence"])?;
            require(
                bounded(&v["offset"], -9_007_199_254_740_991, 9_007_199_254_740_991),
                "rule offset",
            )?;
        }
    }
    for (day, e) in object(&record["exceptions"])? {
        require(date(&V::String(day.clone())), "exception origin")?;
        object(e)?;
        flags(e)?;
        if let Some(d) = e.get("date") {
            require(date(d), "exception date")?
        }
        let base = vs
            .iter()
            .rev()
            .find(|v| v["from"].as_str().unwrap() <= day.as_str())
            .ok_or("Exception precedes Planner versions")?;
        if e["removed"] == true {
            continue;
        }
        let base = if is_meeting && !base["localOverride"].is_null() {
            merged(base, &base["localOverride"])?
        } else {
            base.clone()
        };
        let mut full = merged(&base, e)?;
        if e.get("date").is_none() {
            full["date"] = V::String(day.clone())
        }
        if is_meeting {
            meeting(&full)?
        } else {
            session(&full)?
        }
    }
    Ok(())
}
fn validate(p: &V) -> Result<()> {
    for key in ["settings", "sessions", "rules", "meetings", "sources"] {
        object(&p[key])?;
    }
    for s in object(&p["sessions"])?.values() {
        object(s)?;
        require(date(&s["date"]), "session date")?;
        session(s)?;
    }
    for r in object(&p["rules"])?.values() {
        object(r)?;
        versions(r, false)?;
    }
    for (id, m) in object(&p["meetings"])? {
        require(
            m["id"].as_str() == Some(id) && m["title"].is_string() && m["content"].is_string(),
            "meeting identity",
        )?;
        versions(m, true)?;
        if !m["source"].is_null() {
            require(
                m["source"]
                    .as_str()
                    .is_some_and(|s| p["sources"].get(s).is_some())
                    && m["uid"].as_str().is_some_and(|u| !u.trim().is_empty()),
                "import source/UID",
            )?;
            for (day, c) in object(&m["coverage"])? {
                require(date(&V::String(day.clone())), "coverage origin")?;
                meeting(c)?;
            }
        }
    }
    Ok(())
}
