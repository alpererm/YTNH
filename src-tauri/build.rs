use std::{fs, path::PathBuf};
fn main() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("..");
    // Regenerate absent frontend output even when Cargo artifacts were restored.
    println!("cargo:rerun-if-changed=../web/index.html");
    println!("cargo:rerun-if-changed=../app.html");
    println!("cargo:rerun-if-changed=../bridge.js");
    println!("cargo:rerun-if-changed=../library-bridge.js");
    let library_bridge =
        fs::read_to_string(root.join("library-bridge.js")).expect("Missing library adapter");
    let library_bridge = library_bridge.replace(
        "/* image-preview-build */ false",
        if std::env::var_os("CARGO_FEATURE_INLINE_IMAGES_PREVIEW").is_some() {
            "true"
        } else {
            "false"
        },
    );
    let html = fs::read_to_string(root.join("app.html")).expect("Missing shared app.html");
    let mut html = html;
    for name in [
        "planner-model.js",
        "planner-ui.js",
        "planner-meetings.js",
        "vendor/icaljs/ical.js",
        "planner-outlook.js",
        "markdown-import.js",
        "tour-library.js",
    ] {
        println!("cargo:rerun-if-changed=../{name}");
        let script = fs::read_to_string(root.join(name)).expect("Missing planner component");
        html = html.replace(
            &format!(r#"<script src="{name}"></script>"#),
            &format!("<script>{script}</script>"),
        );
    }
    println!("cargo:rerun-if-changed=../planner.css");
    let css = fs::read_to_string(root.join("planner.css")).expect("Missing planner stylesheet");
    html = html.replace(
        r#"<link rel="stylesheet" href="planner.css">"#,
        &format!("<style>{css}</style>"),
    );
    let bridge = fs::read_to_string(root.join("bridge.js")).expect("Missing desktop bridge");
    assert!(
        html.contains("<script>\"use strict\";"),
        "Expected shared app script marker"
    );
    assert!(!bridge.contains("</script>"));
    let desktop = html.replacen(
        "<script>\"use strict\";",
        &format!("<script>{library_bridge}\n{bridge}</script><script>\"use strict\";"),
        1,
    );
    fs::create_dir_all(root.join("web")).unwrap();
    fs::write(root.join("web/index.html"), desktop).unwrap();
    tauri_build::build()
}
