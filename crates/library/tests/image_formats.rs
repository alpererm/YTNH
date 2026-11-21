use yutanohe_library::images::{image_extension, store_original};
#[test]
fn native_image_formats_preserve_bytes() {
    let dir = tempfile::tempdir().unwrap();
    for (bytes, ext) in [
        (&include_bytes!("fixtures/images/pixel.jpeg")[..], "jpg"),
        (&include_bytes!("fixtures/images/pixel.heic")[..], "heif"),
        (&include_bytes!("fixtures/images/pixel.gif")[..], "gif"),
        (&include_bytes!("fixtures/images/pixel.webp")[..], "webp"),
        (
            &include_bytes!("../../../src-tauri/icons/icon.png")[..],
            "png",
        ),
    ] {
        assert_eq!(image_extension(bytes).unwrap(), ext);
        let image = store_original(dir.path(), bytes, false).unwrap();
        assert_eq!(std::fs::read(dir.path().join(image.hash)).unwrap(), bytes);
    }
}
