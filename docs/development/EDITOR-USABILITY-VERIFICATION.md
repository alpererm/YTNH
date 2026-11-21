# Editor usability changes — latest 11.4 checkout

Applied to the portable `.ytnh` version only. The separate v11.3.6 comparison checkout is unchanged. No database schema, installation configuration, dependencies or CSP permissions changed. No installer was packaged and nothing was committed or pushed.

## Implemented

- Single-click Outline switching from the editor, including pending body/title edits.
- Blank writing-surface clicks focus the document; clicks below its content place the caret at the end. Modified clicks, dragging and embedded controls retain native behavior.
- Flat pinned shortcuts with a muted collapsible header and device-local collapse persistence. No pinned descendants or item disclosure controls.
- Quick Open: exact/prefix/substring/fuzzy title matches before corresponding body categories, then active/On hold/Done/Cancelled ordering. Code searching and inactive results remain available.
- Heading-start Enter inserts a normal paragraph above the original formatted block.
- A−/A+ controls adjust selected text by 1px between 8px and 96px. Mixed sizes retain their differences; a collapsed caret applies to its word or typing position. Selection remains available for repeated adjustment. The existing content string stores validated `data-text-size` spans, rendered by static CSS under the existing CSP.
- A shared header/document column, a local **Limit editor width** setting (default off, 900px maximum), and a borderless writing area. Narrow sidebars reserve space so toolbar controls remain reachable.
- Outline connector lines removed; separate small chevrons and invisible leaf spacing retained.
- Corrected the reproduced inline Todo parsing failure described below.
- Mouse Back/Forward button events use `navigateFocusHistory`, once per press/release, and suppress WebView page navigation. Dialogs retain priority.
- **+ Add font** searches local OS font families and previews them. Only explicitly added families enter the main selector. Added fonts can be removed without uninstalling them; unavailable selections fall back to System default. Preferences are local to the device.

## Confirmed causes

### First click lost

`richEditor.onblur` called `renderTree()` before the pending Outline click. Replacing the target row between mouse-down and click prevented that click from reaching its original handler. The title blur handler also redrew the tree. Saving still occurs on input/blur; these redundant redraws were removed. Existing title updates now update both Outline and Pinned labels in place.

### Heading formatting lost

`continueRichBlock` extracted the heading's tail into a new block whose type defaulted to `p`, even when the caret was at the very beginning. It now inserts a separate normal paragraph above the existing block in that case. The original formatted DOM is retained.

### Inline Todo creation rejected ordinary phrases

Before the fix, synthetic typing of `<A phone call>` produced no Todo, while `<Schedule call>` succeeded. `finishInlineTodo` treated any leading HTML tag name followed by a word boundary as literal HTML; this rejected normal phrases beginning with “a”, “table”, “label”, and similar words. It now reserves bare tags, closing tags, attribute syntax, URLs and comparisons while allowing those ordinary phrases. Typed and formatted-paste cases were reproduced before correction and tested afterward.

This confirms one reproducible cause, not every possible intermittent input issue. Source text and pasted complete `<...>` strings are not automatically converted into database records; the existing Rich Text closing-delimiter interaction remains the creation trigger.

## Native font discovery

- macOS: CoreText `CTFontManagerCopyAvailableFontFamilyNames`, released through CoreFoundation.
- Windows: GDI `EnumFontFamiliesExW` with `DEFAULT_CHARSET`, collecting deduplicated family names rather than styles. The existing process uses a temporary screen device context and releases it afterward.
- No font file copying, downloads, installation, background service or administrator privileges.

References: [Apple CoreText](https://developer.apple.com/documentation/coretext/ctfontmanagercopyavailablefontfamilynames()), [Microsoft font enumeration](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-enumfontfamiliesexa).

## Trackpad limitation

No horizontal-wheel gesture simulation was added. Native [WKWebView back/forward gestures](https://developer.apple.com/documentation/webkit/wkwebview/allowsbackforwardnavigationgestures) and [WebView2 swipe navigation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2settings6?view=webview2-1.0.2849.39) navigate webpage history. YuTaNoHe uses its own item/view history. The current integration does not provide a reliable completed-swipe event connected to that history without changing the navigation architecture. Trackpad swipes therefore remain unsupported; ordinary scrolling is preserved.

## Verification

All fixtures were synthetic; real libraries and master files were not used.

- Eight new core suites: editor-surface, pinned-shortcuts, quick-open-ranking, text-sizing, editor-width, inline-creation, local-fonts, mouse-history. All passed in Chromium and WebKit.
- Full core pass: 77 passed, 2 palette-alignment failures. Those failures were corrected; formatting/palette/sizing rerun: 6 passed, 0 failed. Subsequent narrow-layout checks: 10 passed, 2 outdated sidebar-width expectations. Those expectations assumed the old fixed width and did not account for reopening a dismissed drawer; corrected width checks passed in both engines. No known test failures remain.
- Existing inline-todos and inline-todos-edge: both passed in both engines, covering completion, scheduling, identity, clipboard, references, undo/redo and reopening.
- Desktop CSP simulation still verifies enforcement, Outline depth in all groupings/themes, flat pins, resized images through navigation/Source/reload, and now custom text-size rendering. This is browser simulation of Tauri CSP, not a new packaged-app run.
- Native macOS `cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview`: 18 passed, 0 failed, including real native font discovery and existing portable-storage/recovery/image tests.
- Visual inspection confirmed title/body alignment and the light-theme layout. Both themes are covered by the existing interface/palette tests.
- No actual Windows execution, physical mouse-button verification, trackpad verification or newly packaged desktop verification was performed. Windows font enumeration is implemented but not marked as runtime-tested.

New tests are registered in `tests/core-regressions.cjs`. Relevant previous layout tests were adapted only for intentionally changed borders, pin hierarchy, responsive writing width and the extra compact formatting row; their unrelated assertions remain.
