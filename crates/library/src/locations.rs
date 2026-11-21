use super::*;

// JSON primary locations retain the item ID as their portable address until
// promoted. SQLite keeps its historic placement_keys IDs for those addresses.
pub(crate) fn primary_sql(item: &V, keys: &HashMap<String, String>) -> Result<String> {
    Ok(match item.get("locationId") {
        Some(id) => format!("linked:{}", string(id)?),
        None => keys[string(&item["id"])?].clone(),
    })
}
pub(crate) fn validate(model: &V) -> Result<()> {
    let linked = model["schemaVersion"] == 11;
    if !linked && model.get("locations").is_some() {
        return Err("Unexpected locations in legacy library".into());
    }
    let items = array(&model["items"])?;
    let mut primary = HashMap::new();
    for i in items {
        if !linked && (i.get("locationParent").is_some() || i.get("locationId").is_some()) {
            return Err("Unexpected location fields".into());
        }
        primary.insert(
            string(&i["id"])?,
            string(i.get("locationId").unwrap_or(&i["id"]))?,
        );
    }
    if !linked {
        return Ok(());
    }
    let mut rows = HashMap::new();
    for i in items {
        let item = string(&i["id"])?;
        let parent = if let Some(p) = i.get("locationParent") {
            Some(string(p)?)
        } else {
            i["parentId"]
                .as_str()
                .and_then(|id| primary.get(id).copied())
        };
        if rows
            .insert(
                primary[item],
                (item, parent, i["order"].as_i64(), i["rootId"].as_str()),
            )
            .is_some()
        {
            return Err("Duplicate primary placement".into());
        }
    }
    for (id, p) in object(&model["locations"])? {
        let item = string(&p["item"])?;
        if !primary.contains_key(item)
            || !p["collapsed"].is_boolean()
            || (!p["parent"].is_null() && !p["parent"].is_string())
            || rows
                .insert(
                    id,
                    (
                        item,
                        p["parent"].as_str(),
                        p["order"].as_i64(),
                        p["rootId"].as_str(),
                    ),
                )
                .is_some()
        {
            return Err("Invalid linked placement".into());
        }
    }
    let archived: HashSet<_> = items
        .iter()
        .filter(|i| i["archived"] == true)
        .filter_map(|i| i["id"].as_str())
        .collect();
    let (mut slots, mut siblings, mut roots) = (HashSet::new(), HashSet::new(), HashSet::new());
    let mut edges: HashMap<&str, HashSet<&str>> = HashMap::new();
    for (&id, &(item, parent, order, root)) in &rows {
        if id.is_empty()
            || id.len() > 160
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || order.unwrap_or(0) < 1
        {
            return Err("Invalid placement ID or order".into());
        }
        if !archived.contains(item)
            && (!slots.insert((parent, order)) || !siblings.insert((parent, item)))
        {
            return Err("Duplicate placement under parent".into());
        }
        if let Some(p) = parent {
            let ancestor = rows.get(p).ok_or("Missing parent placement")?.0;
            if root.is_some() || !archived.contains(item) && archived.contains(ancestor) {
                return Err("Invalid placement parent".into());
            }
            edges.entry(item).or_default().insert(ancestor);
        } else if !roots.insert(root.ok_or("Missing root code")?) {
            return Err("Duplicate location root code".into());
        }
    }
    // Check the logical graph too, including cycles spanning separate copies.
    fn depth<'a>(
        id: &'a str,
        edges: &HashMap<&'a str, HashSet<&'a str>>,
        stack: &mut HashSet<&'a str>,
        known: &mut HashMap<&'a str, usize>,
    ) -> Result<usize> {
        if let Some(n) = known.get(id) {
            return Ok(*n);
        }
        if stack.len() >= 256 || !stack.insert(id) {
            return Err("Circular or excessively deep locations".into());
        }
        let mut n = 1;
        for parent in edges.get(id).into_iter().flatten() {
            n = n.max(1 + depth(parent, edges, stack, known)?);
        }
        if n > 256 {
            return Err("Excessive location depth".into());
        }
        stack.remove(id);
        known.insert(id, n);
        Ok(n)
    }
    let (mut stack, mut known) = (HashSet::new(), HashMap::new());
    for i in items {
        let id = string(&i["id"])?;
        let parent = rows[primary[id]].1.and_then(|p| rows.get(p)).map(|p| p.0);
        if parent != i["parentId"].as_str() {
            return Err("Primary parent mismatch".into());
        }
        depth(id, &edges, &mut stack, &mut known)?;
    }
    Ok(())
}
pub(crate) fn read(c: &Connection, model: &mut V) -> Result<()> {
    if model["schemaVersion"] != 11 {
        if c.prepare("SELECT 1 FROM placements p LEFT JOIN placement_keys k ON k.placement=p.id WHERE k.item IS NULL LIMIT 1")?.exists([])?{return Err("Unexpected extra location in legacy library".into())}
        return Ok(());
    }
    let mut query=c.prepare("SELECT p.id,p.item,p.parent,p.ordering,p.root_code,p.collapsed,k.item FROM placements p LEFT JOIN placement_keys k ON k.placement=p.parent JOIN items i ON i.id=p.item JOIN placement_keys own ON own.item=p.item WHERE p.id<>COALESCE('linked:'||json_extract(i.extras,'$.locationId'),own.placement)")?;
    let mut rows = query.query([])?;
    let mut extra = Obj::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let parent: Option<String> = row.get(2)?;
        let primary: Option<String> = row.get(6)?;
        let address = match parent {
            None => None,
            Some(p) => Some(
                primary
                    .or_else(|| p.strip_prefix("linked:").map(str::to_owned))
                    .ok_or("Unknown placement address")?,
            ),
        };
        extra.insert(id.strip_prefix("linked:").ok_or("Unknown linked placement")?.into(),json!({"item":row.get::<_,String>(1)?,"parent":address,"order":row.get::<_,i64>(3)?,"rootId":row.get::<_,Option<String>>(4)?,"collapsed":row.get::<_,bool>(5)?}));
    }
    model["locations"] = V::Object(extra);
    Ok(())
}
