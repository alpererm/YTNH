//! Regenerable previews stay outside the library, snapshots, and the exchange.
use std::{fs, path::Path};
use yutanohe_library::{transfer::immutable, Result};

pub fn preview(original: &Path, bytes: &[u8], ext: &str, cache: &Path) -> Result<Option<Vec<u8>>> {
    if matches!(ext, "gif" | "svg") {
        return Ok(None);
    }
    if ext != "heif" && bytes.len() < 1024 * 1024 {
        return Ok(None);
    }
    fs::create_dir_all(cache)?;
    let path = cache
        .join(original.file_name().ok_or("Missing image identifier")?)
        .with_extension("png");
    if let Ok(bytes) = fs::read(&path) {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Ok(Some(bytes));
        }
        fs::remove_file(&path)?;
    }
    let png = render(original, cache)?;
    immutable(&path, &png)?;
    Ok(Some(png))
}
#[cfg(target_os = "macos")]
fn render(original: &Path, cache: &Path) -> Result<Vec<u8>> {
    let folder = tempfile::tempdir_in(cache)?;
    let output = folder.path().join("preview.png");
    let status = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", "1600"])
        .arg(original)
        .arg("--out")
        .arg(&output)
        .output()?;
    if !status.status.success() {
        return Err("System decoder could not preview this image".into());
    }
    Ok(fs::read(output)?)
}
#[cfg(windows)]
fn render(original: &Path, _cache: &Path) -> Result<Vec<u8>> {
    use windows::{
        core::HSTRING,
        Win32::{Foundation::GENERIC_READ, Graphics::Imaging::*, System::Com::*},
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() }
        }
    }
    // Run on a dedicated thread so the desktop event loop's COM apartment is untouched.
    let path = original.to_owned();
    std::thread::spawn(move || -> Result<Vec<u8>> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
            let _apartment = Apartment;
            let factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let decoder = factory.CreateDecoderFromFilename(
                &HSTRING::from(path.as_os_str()),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )?;
            let frame = decoder.GetFrame(0)?;
            let (mut w, mut h) = (0, 0);
            frame.GetSize(&mut w, &mut h)?;
            if w == 0 || h == 0 {
                return Err("Empty image".into());
            }
            let denominator = w.max(h).max(1600) as u64;
            let w = ((w as u64 * 1600 / denominator) as u32).max(1);
            let h = ((h as u64 * 1600 / denominator) as u32).max(1);
            let scaler = factory.CreateBitmapScaler()?;
            scaler.Initialize(&frame, w, h, WICBitmapInterpolationModeFant)?;
            let converter = factory.CreateFormatConverter()?;
            converter.Initialize(
                &scaler,
                &GUID_WICPixelFormat32bppRGBA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )?;
            let mut pixels = vec![0; (w * h * 4) as usize];
            converter.CopyPixels(std::ptr::null(), w * 4, &mut pixels)?;
            let mut out = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut out, w, h);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);
                encoder.write_header()?.write_image_data(&pixels)?;
            }
            Ok(out)
        }
    })
    .join()
    .map_err(|_| "System image decoder stopped")?
}
#[cfg(not(any(windows, target_os = "macos")))]
fn render(_: &Path, _: &Path) -> Result<Vec<u8>> {
    Err("System image decoder is unavailable".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_preserves_original_and_skips_gif() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("original");
        let png = include_bytes!("../icons/icon.png");
        fs::write(&path, png).unwrap();
        let cache = d.path().join("previews");
        assert!(preview(&path, png, "gif", &cache).unwrap().is_none());
        let rendered = render(&path, d.path()).unwrap();
        assert!(rendered.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(fs::read(path).unwrap(), png);
    }
}
