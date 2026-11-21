//! Immutable managed image originals. Callers supply the library's object directory.
//! Raw SVG bytes are originals only. They must never be inserted into an HTML document.
use crate::{digest, transfer::immutable, Result};
use imagesize::ImageType;
use std::{fs, path::Path};

pub const CONFIRM_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub struct Original {
    pub hash: String,
    pub extension: &'static str,
    pub bytes: usize,
}

pub fn image_extension(bytes: &[u8]) -> Result<&'static str> {
    if let Ok(kind) = imagesize::image_type(bytes) {
        let size = imagesize::blob_size(bytes)?;
        if size.width == 0 || size.height == 0 {
            return Err("Image has empty dimensions".into());
        }
        return Ok(match kind {
            ImageType::Gif => "gif",
            ImageType::Png => "png",
            ImageType::Jpeg => "jpg",
            ImageType::Webp => "webp",
            ImageType::Heif(_) => "heif",
            #[allow(unreachable_patterns)]
            _ => return Err("Unsupported image".into()),
        });
    }
    let xml = std::str::from_utf8(bytes)?;
    let doc = roxmltree::Document::parse_with_options(
        xml,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 1_000_000,
            ..Default::default()
        },
    )?;
    if doc
        .root_element()
        .has_tag_name(("http://www.w3.org/2000/svg", "svg"))
    {
        return Ok("svg");
    }
    Err("Unsupported image".into())
}

pub fn store_original(vault: &Path, bytes: &[u8], confirmed_large: bool) -> Result<Original> {
    if bytes.len() > CONFIRM_BYTES && !confirmed_large {
        return Err("Confirm the image size before importing".into());
    }
    let extension = image_extension(bytes)?;
    let hash = digest(bytes);
    immutable(&vault.join(&hash), bytes)?;
    Ok(Original {
        hash,
        extension,
        bytes: bytes.len(),
    })
}

/// Only content addresses can reach the filesystem. Absence and integrity failure
/// have different meanings when a handoff is still arriving.
pub fn read_original(vault: &Path, hash: &str, expected_bytes: u64) -> Result<Option<Vec<u8>>> {
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("Invalid managed image identifier".into());
    }
    let data = match fs::read(vault.join(hash)) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if data.len() as u64 != expected_bytes || digest(&data) != hash {
        return Err("Managed image failed verification".into());
    }
    Ok(Some(data))
}

#[cfg(test)]
mod tests {
    use super::*;
    const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>"#;
    #[test]
    fn reuse_original_and_distinguish_missing_from_corrupt() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path();
        let a = store_original(folder, SVG, false).unwrap();
        assert_eq!(store_original(folder, SVG, false).unwrap(), a);
        assert_eq!(fs::read_dir(folder).unwrap().count(), 1);
        assert_eq!(
            read_original(folder, &a.hash, a.bytes as u64)
                .unwrap()
                .unwrap(),
            SVG
        );
        assert!(read_original(folder, "../file", 4).is_err());
        fs::write(folder.join(&a.hash), vec![0; a.bytes]).unwrap();
        assert!(read_original(folder, &a.hash, a.bytes as u64).is_err());
        assert!(store_original(folder, SVG, false).is_err());
        fs::remove_file(folder.join(&a.hash)).unwrap();
        assert!(read_original(folder, &a.hash, a.bytes as u64)
            .unwrap()
            .is_none());
    }
    #[test]
    fn no_object_written_for_unsupported_or_unconfirmed_bytes() {
        let temp = tempfile::tempdir().unwrap();
        for bytes in [
            b"<html/>".as_slice(),
            b"<svg>",
            b"GIF",
            &vec![0; CONFIRM_BYTES + 1],
        ] {
            assert!(store_original(temp.path(), bytes, false).is_err());
        }
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
    }
}

pub type Inventory = std::collections::BTreeMap<String, (String, u64)>;

// A conservative scan also protects managed references inside literal Markdown.
// Only registered image content addresses can name a file.
pub fn collect_references(
    text: &str,
    catalog: &serde_json::Value,
    out: &mut Inventory,
) -> Result<()> {
    for tail in text
        .match_indices("assets/")
        .map(|(i, m)| &text[i + m.len()..])
    {
        let Some(hash) = tail.get(..64) else { continue };
        if !hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            continue;
        }
        let Some(rest) = tail[64..].strip_prefix('.') else {
            continue;
        };
        let suffix = rest
            .split(|c: char| !c.is_ascii_alphanumeric())
            .next()
            .unwrap_or("");
        if !matches!(suffix, "gif" | "jpg" | "png" | "heif" | "webp" | "svg") {
            continue;
        }
        {
            let meta = catalog
                .get(hash)
                .ok_or("Managed image has no inventory record")?;
            if meta["extension"].as_str() != Some(suffix) {
                return Err("Image reference has an incorrect file extension".into());
            }
            let ext = meta["extension"].as_str().ok_or("Missing image type")?;
            if !matches!(ext, "png" | "gif" | "jpg" | "svg" | "webp" | "heif") {
                return Err("Invalid managed image type".into());
            }
            out.insert(
                hash.to_string(),
                (
                    ext.into(),
                    meta["bytes"].as_u64().ok_or("Missing image size")?,
                ),
            );
        }
    }
    Ok(())
}
pub fn required(repo: &crate::Repository, vault: &Path) -> Result<Inventory> {
    let mut out = Inventory::new();
    let Some(raw) = repo.library_metadata("imageAssets")? else {
        return Ok(out);
    };
    let catalog: serde_json::Value = serde_json::from_str(&raw)?;
    let model = repo.load()?;
    for item in model["items"].as_array().ok_or("Missing items")? {
        collect_references(item["content"].as_str().unwrap_or(""), &catalog, &mut out)?;
    }
    if let Some(meetings) = model["planner"]["meetings"].as_object() {
        for meeting in meetings.values() {
            collect_references(meeting["content"].as_str().unwrap_or(""), &catalog, &mut out)?;
        }
    }
    for (id, (hash, len)) in repo.inventory()? {
        let bytes = read_original(vault, &hash, len)?
            .ok_or("Cold archive missing during image verification")?;
        crate::transfer::verify_archive(&model, &id, &bytes)?;
        let archive: serde_json::Value = serde_json::from_slice(&bytes)?;
        for item in archive["items"]
            .as_array()
            .ok_or("Missing archived items")?
        {
            collect_references(item["content"].as_str().unwrap_or(""), &catalog, &mut out)?;
        }
    }
    Ok(out)
}
/// Copy verified immutable originals. Missing files may be deferred only while receiving.
pub fn copy_required(
    images: &Inventory,
    source: &Path,
    destination: &Path,
    allow_missing: bool,
) -> Result<bool> {
    let mut complete = true;
    for (hash, (_, len)) in images {
        match read_original(source, hash, *len)? {
            Some(bytes) => immutable(&destination.join(hash), &bytes)?,
            None if allow_missing => complete = false,
            None => return Err(format!("Required original {hash} is not available yet").into()),
        }
    }
    Ok(complete)
}

pub fn export_files(images: &Inventory, vault: &Path, dest: &Path) -> Result<()> {
    for (hash, (ext, len)) in images {
        let bytes = read_original(vault, hash, *len)?.ok_or("Required image not available yet")?;
        immutable(&dest.join("assets").join(format!("{hash}.{ext}")), &bytes)?;
    }
    Ok(())
}
