//! Enumerate visible local font families. No font files are read or copied.
#[tauri::command]
pub async fn installed_font_families() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(families)
        .await
        .map_err(|e| e.to_string())?
}
fn normalize(mut names: Vec<String>) -> Vec<String> {
    names.retain(|s| !s.is_empty() && !s.starts_with('@') && !s.starts_with('.'));
    names.sort_by_key(|s| s.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}
#[cfg(target_os = "macos")]
fn families() -> Result<Vec<String>, String> {
    use std::ffi::c_void;
    type Ref = *const c_void;
    #[link(name = "CoreText", kind = "framework")]
    extern "C" {
        fn CTFontManagerCopyAvailableFontFamilyNames() -> Ref;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFArrayGetCount(array: Ref) -> isize;
        fn CFArrayGetValueAtIndex(array: Ref, index: isize) -> Ref;
        fn CFStringGetLength(string: Ref) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(string: Ref, buffer: *mut u8, size: isize, encoding: u32) -> bool;
        fn CFRelease(value: Ref);
    }
    unsafe {
        let array = CTFontManagerCopyAvailableFontFamilyNames();
        if array.is_null() {
            return Err("Installed font list is unavailable".into());
        }
        let mut result = Vec::new();
        for i in 0..CFArrayGetCount(array) {
            let string = CFArrayGetValueAtIndex(array, i);
            let length =
                CFStringGetMaximumSizeForEncoding(CFStringGetLength(string), 0x08000100) + 1;
            if length <= 0 {
                continue;
            }
            let mut buffer = vec![0u8; length as usize];
            if CFStringGetCString(string, buffer.as_mut_ptr(), length, 0x08000100) {
                if let Some(end) = buffer.iter().position(|b| *b == 0) {
                    if let Ok(name) = std::str::from_utf8(&buffer[..end]) {
                        result.push(name.to_owned())
                    }
                }
            }
        }
        CFRelease(array);
        Ok(normalize(result))
    }
}
#[cfg(target_os = "windows")]
fn families() -> Result<Vec<String>, String> {
    use std::ffi::c_void;
    #[repr(C)]
    struct LogFont {
        metrics: [i32; 5],
        flags: [u8; 8],
        face: [u16; 32],
    }
    type Callback = unsafe extern "system" fn(*const LogFont, *const c_void, u32, isize) -> i32;
    #[link(name = "user32")]
    extern "system" {
        fn GetDC(window: *mut c_void) -> *mut c_void;
        fn ReleaseDC(window: *mut c_void, dc: *mut c_void) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn EnumFontFamiliesExW(
            dc: *mut c_void,
            font: *const LogFont,
            callback: Callback,
            data: isize,
            flags: u32,
        ) -> i32;
    }
    unsafe extern "system" fn collect(
        font: *const LogFont,
        _metrics: *const c_void,
        _kind: u32,
        data: isize,
    ) -> i32 {
        let face = &(*font).face;
        let end = face.iter().position(|c| *c == 0).unwrap_or(face.len());
        if let Ok(name) = String::from_utf16(&face[..end]) {
            (*(data as *mut Vec<String>)).push(name)
        }
        1
    }
    unsafe {
        let dc = GetDC(std::ptr::null_mut());
        if dc.is_null() {
            return Err("Installed font list is unavailable".into());
        }
        let mut font = LogFont {
            metrics: [0; 5],
            flags: [0; 8],
            face: [0; 32],
        };
        font.flags[3] = 1; // DEFAULT_CHARSET includes all installed character sets.
        let mut result = Vec::<String>::new();
        EnumFontFamiliesExW(dc, &font, collect, &mut result as *mut _ as isize, 0);
        ReleaseDC(std::ptr::null_mut(), dc);
        Ok(normalize(result))
    }
}
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn families() -> Result<Vec<String>, String> {
    Err("Font discovery is supported on Windows and macOS".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unique_families() {
        assert_eq!(
            normalize(vec![
                "Arial".into(),
                "arial".into(),
                "@Vertical".into(),
                ".Private".into()
            ]),
            vec!["Arial"]
        )
    }
    #[test]
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn native_families_are_available() {
        let names = families().unwrap();
        assert!(!names.is_empty());
        assert!(names.iter().all(|s| !s.is_empty()))
    }
}
