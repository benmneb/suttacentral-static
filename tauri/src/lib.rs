use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::webview::WebviewWindow;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use objc2::DefinedClass;
#[cfg(target_os = "macos")]
use objc2_foundation::NSObjectProtocol;
#[cfg(target_os = "macos")]
use objc2_web_kit::WKUIDelegate;

static TAB_COUNTER: AtomicU32 = AtomicU32::new(0);
// Monotonic counter bumped on every CloseRequested. The debounce thread compares
// its captured value against the current one to detect batched tab closes.
static CLOSE_SEQ: AtomicU32 = AtomicU32::new(0);
// URL of the link most recently right-clicked; set from JS via store_context_link.
static CONTEXT_LINK: Mutex<String> = Mutex::new(String::new());
// Original IMP of WKWebView's willOpenMenu:withEvent:, saved during swizzle.
#[cfg(target_os = "macos")]
static ORIG_WILL_OPEN_MENU: std::sync::OnceLock<objc2::runtime::Imp> = std::sync::OnceLock::new();

// Per-webview associated object keys — address of each static is the unique ObjC key.
#[cfg(target_os = "macos")]
static TEXT_FINDER_KEY: u8 = 0; // RETAIN — current NSTextFinder (replaced on each open)
#[cfg(target_os = "macos")]
static TFC_KEY: u8 = 0; // ASSIGN — WKTextFinderClient (set once, never changes)
#[cfg(target_os = "macos")]
static FIND_BAR_VIEW_KEY: u8 = 0; // ASSIGN — weak ptr to bar NSView (NSTextFinder owns it)
#[cfg(target_os = "macos")]
static FIND_BAR_VISIBLE_KEY: u8 = 0; // ASSIGN — non-null = visible, null = hidden

// ObjC associated-object runtime functions.
#[cfg(target_os = "macos")]
extern "C" {
    fn objc_getAssociatedObject(
        object: *const std::ffi::c_void,
        key: *const std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn objc_setAssociatedObject(
        object: *mut std::ffi::c_void,
        key: *const std::ffi::c_void,
        value: *mut std::ffi::c_void,
        policy: usize,
    );
}

// OBJC_ASSOCIATION_RETAIN_NONATOMIC — retains value, released when host is deallocated.
#[cfg(target_os = "macos")]
const OBJC_ASSOCIATION_RETAIN_NONATOMIC: usize = 1;
// OBJC_ASSOCIATION_ASSIGN — weak, no retain/release (caller manages lifetime).
#[cfg(target_os = "macos")]
const OBJC_ASSOCIATION_ASSIGN: usize = 0;

#[cfg(target_os = "macos")]
unsafe fn get_associated_obj(
    obj: *mut objc2::runtime::AnyObject,
    key: &u8,
) -> *mut objc2::runtime::AnyObject {
    objc_getAssociatedObject(obj as *const _, key as *const u8 as *const _)
        as *mut objc2::runtime::AnyObject
}

#[cfg(target_os = "macos")]
unsafe fn set_associated_obj(
    obj: *mut objc2::runtime::AnyObject,
    key: &u8,
    value: *mut objc2::runtime::AnyObject,
    policy: usize,
) {
    objc_setAssociatedObject(
        obj as *mut _,
        key as *const u8 as *const _,
        value as *mut _,
        policy,
    );
}

// NSRect/NSPoint/NSSize — identical to CGRect/CGPoint/CGSize on 64-bit macOS.
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSPoint {
    x: f64,
    y: f64,
}
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSSize {
    width: f64,
    height: f64,
}
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSRect {
    origin: NSPoint,
    size: NSSize,
}
// NSEdgeInsets — top, left, bottom, right.
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSEdgeInsets {
    top: f64,
    left: f64,
    bottom: f64,
    right: f64,
}

// Implement objc2::encode::Encode so these types can be used with msg_send!.
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::Encode for NSPoint {
    const ENCODING: objc2::encode::Encoding =
        objc2::encode::Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::RefEncode for NSPoint {
    const ENCODING_REF: objc2::encode::Encoding =
        objc2::encode::Encoding::Pointer(&<Self as objc2::encode::Encode>::ENCODING);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::Encode for NSSize {
    const ENCODING: objc2::encode::Encoding =
        objc2::encode::Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::RefEncode for NSSize {
    const ENCODING_REF: objc2::encode::Encoding =
        objc2::encode::Encoding::Pointer(&<Self as objc2::encode::Encode>::ENCODING);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::Encode for NSRect {
    const ENCODING: objc2::encode::Encoding =
        objc2::encode::Encoding::Struct("CGRect", &[NSPoint::ENCODING, NSSize::ENCODING]);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::RefEncode for NSRect {
    const ENCODING_REF: objc2::encode::Encoding =
        objc2::encode::Encoding::Pointer(&<Self as objc2::encode::Encode>::ENCODING);
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::Encode for NSEdgeInsets {
    const ENCODING: objc2::encode::Encoding = objc2::encode::Encoding::Struct(
        "NSEdgeInsets",
        &[f64::ENCODING, f64::ENCODING, f64::ENCODING, f64::ENCODING],
    );
}
#[cfg(target_os = "macos")]
unsafe impl objc2::encode::RefEncode for NSEdgeInsets {
    const ENCODING_REF: objc2::encode::Encoding =
        objc2::encode::Encoding::Pointer(&<Self as objc2::encode::Encode>::ENCODING);
}

/// Position the find bar at the top of `container` (full width) and push the
/// WKWebView scroll-content down so the bar does not overlap the page.
/// Call with `bar_height = 0.0` to reset (when the bar is hidden/removed).
#[cfg(target_os = "macos")]
unsafe fn layout_find_bar(container: *mut objc2::runtime::AnyObject, bar_height: f64) {
    use objc2::ffi;
    use objc2::runtime::AnyClass;
    use std::ffi::CStr;

    // WryWebView extends under the title bar (fullSizeContentView).
    // safeAreaInsets.top gives the title bar height so we can position below it.
    let safe_area: NSEdgeInsets = objc2::msg_send![container, safeAreaInsets];
    let title_bar_h = safe_area.top;

    // Position the bar view frame just below the title bar, centered horizontally
    // at its natural (intrinsic) width.
    let view = get_associated_obj(container, &FIND_BAR_VIEW_KEY);
    if !view.is_null() && bar_height > 0.0 {
        let bounds: NSRect = objc2::msg_send![container, bounds];
        let natural: NSRect = objc2::msg_send![view, frame];
        let bar_width = if natural.size.width > 0.0 {
            natural.size.width
        } else {
            bounds.size.width
        };
        let bar_x = ((bounds.size.width - bar_width) / 2.0).max(0.0);
        let is_flipped: bool = objc2::msg_send![container, isFlipped];
        let bar_y = if is_flipped {
            title_bar_h
        } else {
            bounds.size.height - title_bar_h - bar_height
        };
        let bar_rect = NSRect {
            origin: NSPoint { x: bar_x, y: bar_y },
            size: NSSize {
                width: bar_width,
                height: bar_height,
            },
        };
        let _: () = objc2::msg_send![view, setFrame: bar_rect];
    }

    // _setTopContentInset: tells WKWebView to offset the rendered content downward,
    // exactly like Safari does when its toolbar overlaps the webview.
    let wk_cls_name = CStr::from_bytes_with_nul(b"WKWebView\0").unwrap();
    let Some(wk_cls) = AnyClass::get(wk_cls_name) else {
        return;
    };
    let sel_name = CStr::from_bytes_with_nul(b"_setTopContentInset:\0").unwrap();
    let Some(sel) = ffi::sel_registerName(sel_name.as_ptr()) else {
        return;
    };
    let m = ffi::class_getInstanceMethod(wk_cls as *const AnyClass, sel);
    if m.is_null() {
        return;
    }
    let imp = ffi::method_getImplementation(m);
    type FnSetF64 =
        unsafe extern "C-unwind" fn(*mut objc2::runtime::AnyObject, objc2::runtime::Sel, f64);
    let set_inset: FnSetF64 = std::mem::transmute(imp);
    // Include title_bar_h because _setTopContentInset: replaces (not adds to)
    // WKWebView's existing title bar inset. Without it, content slides up behind
    // the title bar. When bar_height is 0 (bar hidden) this restores the original inset.
    let _ = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
        set_inset(container, sel, title_bar_h + bar_height);
    }));
}

fn save_session<R: tauri::Runtime>(app: &tauri::AppHandle<R>, exclude_label: Option<&str>) {
    let mut windows: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| Some(label.as_str()) != exclude_label)
        .collect();
    windows.sort_by(|(a, _), (b, _)| {
        if a == "main" {
            std::cmp::Ordering::Less
        } else if b == "main" {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });
    // Save path+query+fragment only — works across dev and prod since
    // WebviewUrl::App resolves the path to the right origin in each context.
    let paths: Vec<String> = windows
        .iter()
        .filter_map(|(_, w)| w.url().ok())
        .map(|u| {
            let mut s = u.path().to_owned();
            if let Some(q) = u.query() {
                s.push('?');
                s.push_str(q);
            }
            if let Some(f) = u.fragment() {
                s.push('#');
                s.push_str(f);
            }
            s
        })
        .collect();
    // Never overwrite with an empty list — a spurious call during teardown
    // (e.g. WKWebView navigating to blank before destruction) would lose the session.
    if paths.is_empty() {
        return;
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(
            dir.join("session.json"),
            serde_json::to_string(&paths).unwrap_or_default(),
        );
    }
}

fn load_session(app: &tauri::AppHandle) -> Vec<String> {
    app.path()
        .app_data_dir()
        .ok()
        .and_then(|dir| std::fs::read_to_string(dir.join("session.json")).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn is_internal_url(url: &tauri::Url) -> bool {
    let s = url.as_str();
    s.starts_with("http://localhost:3000")
        || s.starts_with("http://localhost")
        || s.starts_with("tauri://localhost")
        || url.scheme() == "tauri"
}

fn to_web_url(url: &str) -> String {
    url.replacen("http://localhost:3000", "https://suttacentral.express", 1)
        .replacen("http://localhost", "https://suttacentral.express", 1)
        .replacen("tauri://localhost", "https://suttacentral.express", 1)
}

fn make_nav_handler() -> impl Fn(&tauri::Url) -> bool + Send + 'static {
    |url| {
        if is_internal_url(url) {
            true
        } else if matches!(url.scheme(), "http" | "https" | "mailto") {
            let _ = tauri_plugin_opener::open_url(url.to_string(), None::<String>);
            false
        } else {
            true
        }
    }
}

fn build_window<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    label: &str,
    url: WebviewUrl,
    #[cfg_attr(not(target_os = "macos"), allow(unused_variables))] initial_zoom: f64,
) -> tauri::Result<WebviewWindow<R>> {
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(manager, label, url)
        .title("SuttaCentral Express")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .fullscreen(false)
        .initialization_script(include_str!("init_script.js"))
        .on_navigation(make_nav_handler());

    #[cfg(target_os = "macos")]
    {
        builder = builder.tabbing_identifier("sc-express");
    }

    let window = builder.build()?;

    #[cfg(target_os = "macos")]
    apply_macos_config(&window, initial_zoom);

    // Debounced session save on tab close. Bumping CLOSE_SEQ and sleeping 100 ms
    // means batched closes (red X / Cmd+Q) all land in the same window: only the
    // last thread finds seq == CLOSE_SEQ and fires. By then the window is already
    // destroyed, so save_session sees only the remaining tabs. If every tab closes
    // (seq still matches but paths is empty) the !paths.is_empty() guard skips the
    // write and the nav save is preserved.
    let app_handle = manager.app_handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let seq = CLOSE_SEQ.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
            let app_clone = app_handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if CLOSE_SEQ.load(Ordering::SeqCst) == seq {
                    save_session(&app_clone, None);
                }
            });
        }
    });

    Ok(window)
}

#[cfg(target_os = "macos")]
struct ScUIDelegateIvars {
    open_tab: Box<dyn Fn(String, f64) + Send + 'static>,
    copy_link: Box<dyn Fn() + Send + 'static>,
}

#[cfg(target_os = "macos")]
objc2::define_class!(
    #[unsafe(super(objc2::runtime::NSObject))]
    #[name = "SuttaCentralExpressUIDelegate"]
    #[thread_kind = objc2::MainThreadOnly]
    #[ivars = ScUIDelegateIvars]
    struct ScUIDelegate;

    unsafe impl NSObjectProtocol for ScUIDelegate {}

    unsafe impl WKUIDelegate for ScUIDelegate {
        #[cfg(target_os = "macos")]
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        unsafe fn create_web_view(
            &self,
            web_view: &objc2_web_kit::WKWebView,
            _config: &objc2_web_kit::WKWebViewConfiguration,
            action: &objc2_web_kit::WKNavigationAction,
            _window_features: &objc2_web_kit::WKWindowFeatures,
        ) -> Option<objc2::rc::Retained<objc2_web_kit::WKWebView>> {
            // Read pageZoom from source webview (we're on the main thread here).
            let zoom: f64 = objc2::msg_send![web_view, pageZoom];
            let zoom = if zoom > 0.0 { zoom } else { 1.0 };
            let request = action.request();
            if let Some(url) = request.URL() {
                if let Some(s) = url.absoluteString() {
                    (self.ivars().open_tab)(s.to_string(), zoom);
                }
            }
            None
        }
    }

    impl ScUIDelegate {
        #[unsafe(method(copyWebLink:))]
        fn copy_web_link(&self, _sender: &objc2::runtime::AnyObject) {
            (self.ivars().copy_link)();
        }
    }
);

#[cfg(target_os = "macos")]
impl ScUIDelegate {
    fn new(
        mtm: objc2_foundation::MainThreadMarker,
        open_tab: Box<dyn Fn(String, f64) + Send + 'static>,
        copy_link: Box<dyn Fn() + Send + 'static>,
    ) -> objc2::rc::Retained<Self> {
        let delegate = mtm.alloc::<ScUIDelegate>().set_ivars(ScUIDelegateIvars {
            open_tab,
            copy_link,
        });
        unsafe { objc2::msg_send![super(delegate), init] }
    }
}

/// Swizzles WKWebView's willOpenMenu:withEvent: once so we can intercept the
/// native context menu and redirect "Copy Link" to copy the public web URL.
#[cfg(target_os = "macos")]
fn install_menu_swizzle() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| unsafe {
        use objc2::ffi;
        use objc2::runtime::{AnyClass, Imp};
        use std::ffi::CStr;

        let name = CStr::from_bytes_with_nul(b"WKWebView\0").unwrap();
        let Some(cls) = AnyClass::get(name) else {
            return;
        };
        let sel = objc2::sel!(willOpenMenu:withEvent:);
        let method = ffi::class_getInstanceMethod(cls as *const AnyClass, sel);
        if method.is_null() {
            return;
        }
        let our_imp: Imp = std::mem::transmute(
            our_will_open_menu
                as unsafe extern "C-unwind" fn(
                    *mut objc2::runtime::AnyObject,
                    objc2::runtime::Sel,
                    *mut objc2::runtime::AnyObject,
                    *mut objc2::runtime::AnyObject,
                ),
        );
        if let Some(orig) = ffi::method_setImplementation(method, our_imp) {
            let _ = ORIG_WILL_OPEN_MENU.set(orig);
        }
    });
}

#[cfg(target_os = "macos")]
unsafe extern "C-unwind" fn our_will_open_menu(
    this: *mut objc2::runtime::AnyObject,
    sel: objc2::runtime::Sel,
    menu: *mut objc2::runtime::AnyObject,
    event: *mut objc2::runtime::AnyObject,
) {
    use objc2::runtime::AnyObject;

    // Call the original WebKit implementation first.
    if let Some(orig) = ORIG_WILL_OPEN_MENU.get() {
        type F = unsafe extern "C-unwind" fn(
            *mut AnyObject,
            objc2::runtime::Sel,
            *mut AnyObject,
            *mut AnyObject,
        );
        let f: F = std::mem::transmute(*orig);
        f(this, sel, menu, event);
    }

    // Locate our ScUIDelegate attached to this WKWebView.
    let wk = &*(this as *const objc2_web_kit::WKWebView);
    let Some(ui_delegate) = wk.UIDelegate() else {
        return;
    };

    // Iterate the NSMenu items and redirect "Copy Link" to our copyWebLink: action.
    use objc2_app_kit::{NSMenu, NSUserInterfaceItemIdentification};
    let ns_menu = &*(menu as *const NSMenu);
    for i in 0..ns_menu.numberOfItems() {
        let Some(item) = ns_menu.itemAtIndex(i) else {
            continue;
        };
        let is_copy_link = item
            .identifier()
            .map(|id| id.to_string() == "WKMenuItemIdentifierCopyLink")
            .unwrap_or(false);
        if !is_copy_link {
            continue;
        }
        item.setAction(Some(objc2::sel!(copyWebLink:)));
        // ProtocolObject<dyn WKUIDelegate> is repr(C) over AnyObject — safe cast.
        let target: &AnyObject = &*(objc2::rc::Retained::as_ptr(&ui_delegate) as *const AnyObject);
        item.setTarget(Some(target));
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn fbs_find_bar_view(
    this: *mut objc2::runtime::AnyObject,
    _sel: objc2::runtime::Sel,
) -> *mut objc2::runtime::AnyObject {
    get_associated_obj(this, &FIND_BAR_VIEW_KEY)
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn fbs_set_find_bar_view(
    _this: *mut objc2::runtime::AnyObject,
    _sel: objc2::runtime::Sel,
    view: *mut objc2::runtime::AnyObject,
) {
    // Just store the view pointer. Do NOT addSubview or change visibility here —
    // NSTextFinder calls setFindBarView: first to hand us the view, then immediately
    // calls setFindBarVisible: false (initialising state), then setFindBarVisible: true
    // to actually show it. If we addSubview here, isFindBarVisible returns true and
    // NSTextFinder skips the setFindBarVisible: true call, leaving the bar hidden.
    if view.is_null() {
        set_associated_obj(
            _this,
            &FIND_BAR_VISIBLE_KEY,
            std::ptr::null_mut(),
            OBJC_ASSOCIATION_ASSIGN,
        );
        set_associated_obj(
            _this,
            &FIND_BAR_VIEW_KEY,
            std::ptr::null_mut(),
            OBJC_ASSOCIATION_ASSIGN,
        );
    } else {
        set_associated_obj(_this, &FIND_BAR_VIEW_KEY, view, OBJC_ASSOCIATION_ASSIGN);
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn fbs_is_find_bar_visible(
    this: *mut objc2::runtime::AnyObject,
    _sel: objc2::runtime::Sel,
) -> bool {
    !get_associated_obj(this, &FIND_BAR_VISIBLE_KEY).is_null()
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn fbs_set_find_bar_visible(
    this: *mut objc2::runtime::AnyObject,
    _sel: objc2::runtime::Sel,
    visible: bool,
) {
    let view = get_associated_obj(this, &FIND_BAR_VIEW_KEY);
    if view.is_null() {
        return;
    }
    let vis_ptr: *mut objc2::runtime::AnyObject = if visible {
        1usize as *mut _
    } else {
        std::ptr::null_mut()
    };
    set_associated_obj(
        this,
        &FIND_BAR_VISIBLE_KEY,
        vis_ptr,
        OBJC_ASSOCIATION_ASSIGN,
    );
    if visible {
        // addSubview: is idempotent if already a subview, so safe to call every time.
        let _ = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
            let _: () = objc2::msg_send![this, addSubview: view];
            let _: () = objc2::msg_send![view, setHidden: false];
        }));
        let bar_frame: NSRect = objc2::msg_send![view, frame];
        let bar_height = if bar_frame.size.height > 0.0 {
            bar_frame.size.height
        } else {
            44.0
        };
        layout_find_bar(this, bar_height);
    } else {
        // Remove the bar view from the hierarchy and clear our pointer.
        // This ensures findBarView returns nil on the next open, so the next
        // NSTextFinder goes through the full init sequence (setFindBarView: +
        // setFindBarVisible: true) rather than trying to reuse a stale view.
        set_associated_obj(
            this,
            &FIND_BAR_VIEW_KEY,
            std::ptr::null_mut(),
            OBJC_ASSOCIATION_ASSIGN,
        );
        let _ = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
            let _: () = objc2::msg_send![view, removeFromSuperview];
        }));
        layout_find_bar(this, 0.0);
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn fbs_find_bar_view_did_change_height(
    this: *mut objc2::runtime::AnyObject,
    _sel: objc2::runtime::Sel,
) {
    let view = get_associated_obj(this, &FIND_BAR_VIEW_KEY);
    if view.is_null() {
        return;
    }
    let bar_frame: NSRect = objc2::msg_send![view, frame];
    let bar_height = if bar_frame.size.height > 0.0 {
        bar_frame.size.height
    } else {
        44.0
    };
    layout_find_bar(this, bar_height);
}

/// Patches the actual runtime class of an object (and its superview's class)
/// with NSTextFinderBarContainer methods. Must be called with the live instance
/// because KVO generates subclasses (NSKVONotifying_*) that shadow the original.
#[cfg(target_os = "macos")]
unsafe fn install_find_bar_support_on(instance: *mut objc2::runtime::AnyObject) {
    use objc2::ffi;
    use objc2::runtime::AnyClass;
    use std::ffi::CStr;

    let methods: &[(&[u8], &[u8], usize)] = &[
        (
            b"findBarView\0",
            b"@@:\0",
            fbs_find_bar_view as *const () as usize,
        ),
        (
            b"setFindBarView:\0",
            b"v@:@\0",
            fbs_set_find_bar_view as *const () as usize,
        ),
        (
            b"isFindBarVisible\0",
            b"B@:\0",
            fbs_is_find_bar_visible as *const () as usize,
        ),
        (
            b"setFindBarVisible:\0",
            b"v@:B\0",
            fbs_set_find_bar_visible as *const () as usize,
        ),
        (
            b"findBarViewDidChangeHeight\0",
            b"v@:\0",
            fbs_find_bar_view_did_change_height as *const () as usize,
        ),
    ];

    // Patch the actual runtime class of instance + its superview's class.
    let superview: *mut objc2::runtime::AnyObject = objc2::msg_send![instance, superview];
    let targets: &[*mut objc2::runtime::AnyObject] = &[instance, superview];

    for &obj in targets {
        if obj.is_null() {
            continue;
        }
        let cls = (*obj).class() as *const AnyClass as *mut AnyClass;
        for &(sel_bytes, types_bytes, imp_usize) in methods {
            let sel_name = CStr::from_bytes_with_nul(sel_bytes).unwrap();
            let types = CStr::from_bytes_with_nul(types_bytes).unwrap();
            if let Some(sel) = ffi::sel_registerName(sel_name.as_ptr()) {
                let imp: objc2::runtime::Imp = std::mem::transmute(imp_usize);
                // Use class_replaceMethod so we override even inherited implementations.
                ffi::class_replaceMethod(cls, sel, imp, types.as_ptr());
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn apply_macos_config<R: tauri::Runtime>(window: &WebviewWindow<R>, initial_zoom: f64) {
    let app_for_tab = window.app_handle().clone();
    let open_tab = Box::new(move |url: String, zoom: f64| {
        let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
        if let Ok(parsed) = url.parse() {
            let _ = build_window(&app_for_tab, &label, WebviewUrl::External(parsed), zoom);
        }
    });

    let app_for_copy = window.app_handle().clone();
    let copy_link = Box::new(move || {
        let url = CONTEXT_LINK.lock().map(|g| g.clone()).unwrap_or_default();
        let web_url = to_web_url(&url);
        if !web_url.is_empty() {
            use tauri_plugin_clipboard_manager::ClipboardExt;
            let _ = app_for_copy.clipboard().write_text(web_url);
        }
    });

    let _ = window.with_webview(move |webview| unsafe {
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::{NSWindow, NSWindowTabbingMode};
        use objc2_foundation::MainThreadMarker;
        use objc2_web_kit::WKWebView;

        let wk = &*(webview.inner() as *const WKWebView);
        wk.setAllowsBackForwardNavigationGestures(true);

        let ns = &*(webview.ns_window() as *const NSWindow);
        ns.setTabbingMode(NSWindowTabbingMode::Preferred);

        // WKWebView holds only a weak reference to its UIDelegate, so we
        // must keep the delegate alive. std::mem::forget gives the ObjC object
        // a permanent retain count of 1 (one small object per window — fine).
        let mtm = MainThreadMarker::new_unchecked();
        let delegate = ScUIDelegate::new(mtm, open_tab, copy_link);
        wk.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        std::mem::forget(delegate);

        install_menu_swizzle();
        install_find_bar_support_on(webview.inner() as *mut objc2::runtime::AnyObject);

        if initial_zoom != 1.0 {
            let _: () = objc2::msg_send![webview.inner() as *mut objc2::runtime::AnyObject, setPageZoom: initial_zoom];
        }
    });
}

#[tauri::command]
fn open_in_new_tab(app: tauri::AppHandle, url: String) -> Result<(), String> {
    // Inherit zoom from the focused tab (macOS only). with_webview dispatches to the
    // main thread; rx.recv() blocks this background thread until the value arrives.
    #[cfg(target_os = "macos")]
    let zoom = {
        let focused = app
            .webview_windows()
            .into_values()
            .find(|w| w.is_focused().unwrap_or(false));
        if let Some(w) = focused {
            let (tx, rx) = std::sync::mpsc::channel();
            let _ = w.with_webview(move |webview| unsafe {
                let wk = webview.inner() as *mut objc2::runtime::AnyObject;
                let z: f64 = objc2::msg_send![wk, pageZoom];
                let _ = tx.send(if z > 0.0 { z } else { 1.0 });
            });
            rx.recv().unwrap_or(1.0)
        } else {
            1.0
        }
    };
    #[cfg(not(target_os = "macos"))]
    let zoom = 1.0_f64;

    let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
    let webview_url = WebviewUrl::External(url.parse().map_err(|e| format!("{e}"))?);
    build_window(&app, &label, webview_url, zoom).map_err(|e| e.to_string())?;
    Ok(())
}

/// Called from init_script.js on every page load so session.json stays current
/// even if the app is killed without a clean close (SIGTERM, SIGKILL, etc.).
#[tauri::command]
fn save_session_on_nav(app: tauri::AppHandle) {
    save_session(&app, None);
}

#[tauri::command]
fn store_context_link(url: String) {
    if let Ok(mut g) = CONTEXT_LINK.lock() {
        *g = url;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        // Only track window state for "main". Tab windows share the tab group's
        // frame — saving/restoring their individual state (especially fullscreen:false)
        // causes them to fight the tab group and exit fullscreen on every new tab open.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == "main")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            open_in_new_tab,
            store_context_link,
            save_session_on_nav
        ])
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            if event.id() == "find" {
                let focused = app
                    .webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false));
                if let Some(window) = focused {
                    let _ = window.with_webview(|webview| unsafe {
                        use objc2::ffi;
                        use objc2::runtime::AnyClass;
                        use std::ffi::CStr;

                        let wk = webview.inner() as *mut objc2::runtime::AnyObject;

                        // One-time WKWebView setup: call private APIs to enable the
                        // platform find UI and init the WKTextFinderClient ivar.
                        // Guard with TFC_KEY so we only do this once per webview.
                        // IMPORTANT: must NOT repeat after the first time — doing so
                        // invalidates the WKTextFinderClient pointer.
                        let tfc: *mut objc2::runtime::AnyObject =
                            if !get_associated_obj(wk, &TFC_KEY).is_null() {
                                get_associated_obj(wk, &TFC_KEY)
                            } else {
                                let wk_cls_name =
                                    CStr::from_bytes_with_nul(b"WKWebView\0").unwrap();
                                let Some(wk_cls) = AnyClass::get(wk_cls_name) else {
                                    return;
                                };

                                let imp_from = |cls: &AnyClass, sel: objc2::runtime::Sel| {
                                    let m =
                                        ffi::class_getInstanceMethod(cls as *const AnyClass, sel);
                                    if m.is_null() {
                                        None
                                    } else {
                                        Some(ffi::method_getImplementation(m))
                                    }
                                };

                                type Fn0 = unsafe extern "C-unwind" fn(
                                    *mut objc2::runtime::AnyObject,
                                    objc2::runtime::Sel,
                                );
                                type Fn1Bool = unsafe extern "C-unwind" fn(
                                    *mut objc2::runtime::AnyObject,
                                    objc2::runtime::Sel,
                                    bool,
                                );

                                let sel_platform = objc2::sel!(_setUsePlatformFindUI:);
                                let sel_ensure = objc2::sel!(_ensureTextFinderClient);
                                if let Some(imp) = imp_from(wk_cls, sel_platform) {
                                    let f: Fn1Bool = std::mem::transmute(imp);
                                    f(wk, sel_platform, true);
                                }
                                if let Some(imp) = imp_from(wk_cls, sel_ensure) {
                                    let f: Fn0 = std::mem::transmute(imp);
                                    f(wk, sel_ensure);
                                }

                                let ivar_name =
                                    CStr::from_bytes_with_nul(b"_textFinderClient\0").unwrap();
                                let iv = ffi::class_getInstanceVariable(
                                    wk_cls as *const AnyClass,
                                    ivar_name.as_ptr(),
                                );
                                if iv.is_null() {
                                    return;
                                }
                                let ptr: *mut objc2::runtime::AnyObject =
                                    ffi::object_getIvar(wk, iv) as *mut _;
                                if ptr.is_null() {
                                    return;
                                }
                                // ASSIGN — WKWebView owns the client; we just borrow the pointer.
                                set_associated_obj(wk, &TFC_KEY, ptr, OBJC_ASSOCIATION_ASSIGN);
                                ptr
                            };

                        if tfc.is_null() {
                            return;
                        }

                        let bar_visible = !get_associated_obj(wk, &FIND_BAR_VISIBLE_KEY).is_null();
                        let tf_existing = get_associated_obj(wk, &TEXT_FINDER_KEY);

                        if bar_visible && !tf_existing.is_null() {
                            // Bar is visible — close via performAction: 11.
                            // NSTextFinder will call setFindBarView: nil which clears
                            // FIND_BAR_VIEW_KEY and FIND_BAR_VISIBLE_KEY for us.
                            // The next open will create a fresh NSTextFinder.
                            let r = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
                                let _: () = objc2::msg_send![tf_existing, performAction: 11usize];
                            }));
                            if let Err(e) = r {
                                eprintln!("[find] error: {:?}", e);
                            }
                        } else {
                            // Bar is not visible — create a fresh NSTextFinder and open.
                            // This handles: first open, after Cmd+F close, after Done button.
                            // NSTextFinder becomes inert after setFindBarView: nil so we
                            // always create a new one rather than trying to reuse.
                            let tf_cls_name = CStr::from_bytes_with_nul(b"NSTextFinder\0").unwrap();
                            let Some(tf_class) = AnyClass::get(tf_cls_name) else {
                                return;
                            };
                            // Null → releases old NSTextFinder via RETAIN_NONATOMIC policy.
                            set_associated_obj(
                                wk,
                                &TEXT_FINDER_KEY,
                                std::ptr::null_mut(),
                                OBJC_ASSOCIATION_RETAIN_NONATOMIC,
                            );
                            let new_tf: *mut objc2::runtime::AnyObject =
                                objc2::msg_send![tf_class, new];
                            let _: () = objc2::msg_send![new_tf, setClient: tfc];
                            let _: () = objc2::msg_send![new_tf, setFindBarContainer: wk];
                            // `new` gives +1; RETAIN_NONATOMIC adds +1 → balance with release.
                            set_associated_obj(
                                wk,
                                &TEXT_FINDER_KEY,
                                new_tf,
                                OBJC_ASSOCIATION_RETAIN_NONATOMIC,
                            );
                            let _: () = objc2::msg_send![new_tf, release];
                            let r = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
                                let _: () = objc2::msg_send![new_tf, performAction: 1usize];
                            }));
                            if let Err(e) = r {
                                eprintln!("[find] error: {:?}", e);
                            }
                        }
                    });
                }
            }
            #[cfg(target_os = "macos")]
            if event.id() == "zoom_in" || event.id() == "zoom_out" || event.id() == "zoom_reset" {
                let focused = app
                    .webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false));
                if let Some(window) = focused {
                    let is_reset = event.id() == "zoom_reset";
                    let zoom_in = event.id() == "zoom_in";
                    let _ = window.with_webview(move |webview| unsafe {
                        let wk = webview.inner() as *mut objc2::runtime::AnyObject;
                        let current: f64 = objc2::msg_send![wk, pageZoom];
                        let new_zoom = if is_reset {
                            1.0
                        } else if zoom_in {
                            (current * 1.1_f64).min(5.0)
                        } else {
                            (current / 1.1_f64).max(0.25)
                        };
                        let _: () = objc2::msg_send![wk, setPageZoom: new_zoom];
                    });
                }
            }
            if event.id() == "copy_link" {
                let focused = app
                    .webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false));
                if let Some(window) = focused {
                    if let Ok(url) = window.url() {
                        let web_url = to_web_url(url.as_str());
                        use tauri_plugin_clipboard_manager::ClipboardExt;
                        let _ = app.clipboard().write_text(web_url);
                    }
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            {
                use tauri::menu::{
                    Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, SubmenuBuilder,
                };
                let menu = Menu::default(app.handle())?;
                let copy_link =
                    MenuItemBuilder::with_id("copy_link", "Copy Web Link").build(app)?;
                let file_submenu = menu.items()?.into_iter().find_map(|item| {
                    if let MenuItemKind::Submenu(s) = item {
                        s.text().ok().filter(|t| t == "File").map(|_| s)
                    } else {
                        None
                    }
                });
                if let Some(submenu) = file_submenu {
                    submenu.append(&PredefinedMenuItem::separator(app)?)?;
                    submenu.append(&copy_link)?;
                } else {
                    let fallback = SubmenuBuilder::new(app, "File").item(&copy_link).build()?;
                    menu.append(&fallback)?;
                }

                #[cfg(target_os = "macos")]
                {
                    let find_item = MenuItemBuilder::with_id("find", "Find...")
                        .accelerator("cmd+f")
                        .build(app)?;
                    let edit_submenu = menu.items()?.into_iter().find_map(|item| {
                        if let MenuItemKind::Submenu(s) = item {
                            s.text().ok().filter(|t| t == "Edit").map(|_| s)
                        } else {
                            None
                        }
                    });
                    if let Some(submenu) = edit_submenu {
                        submenu.append(&PredefinedMenuItem::separator(app)?)?;
                        submenu.append(&find_item)?;
                    } else {
                        let fallback = SubmenuBuilder::new(app, "Edit").item(&find_item).build()?;
                        menu.append(&fallback)?;
                    }

                    let zoom_in = MenuItemBuilder::with_id("zoom_in", "Zoom In")
                        .accelerator("cmd+=")
                        .build(app)?;
                    let zoom_out = MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                        .accelerator("cmd+-")
                        .build(app)?;
                    let zoom_reset = MenuItemBuilder::with_id("zoom_reset", "Actual Size")
                        .accelerator("cmd+0")
                        .build(app)?;
                    let view_submenu = menu.items()?.into_iter().find_map(|item| {
                        if let MenuItemKind::Submenu(s) = item {
                            s.text().ok().filter(|t| t == "View").map(|_| s)
                        } else {
                            None
                        }
                    });
                    if let Some(submenu) = view_submenu {
                        submenu.append(&PredefinedMenuItem::separator(app)?)?;
                        submenu.append(&zoom_in)?;
                        submenu.append(&zoom_out)?;
                        submenu.append(&zoom_reset)?;
                    } else {
                        let fallback = SubmenuBuilder::new(app, "View")
                            .item(&zoom_in)
                            .item(&zoom_out)
                            .item(&zoom_reset)
                            .build()?;
                        menu.append(&fallback)?;
                    }
                }

                app.set_menu(menu)?;

                // Set a blank 16×16 image on our custom items that have no icon,
                // so their text aligns with neighbouring items that do have icons.
                // Uses itemWithTitle: for direct lookup — no inner item loop needed.
                #[cfg(target_os = "macos")]
                let _ = objc2::exception::catch(std::panic::AssertUnwindSafe(|| unsafe {
                    use objc2::runtime::{AnyClass, AnyObject};
                    use std::ffi::{c_char, CStr};

                    let Some(app_cls) =
                        AnyClass::get(CStr::from_bytes_with_nul(b"NSApplication\0").unwrap())
                    else {
                        return;
                    };
                    let ns_app: *mut AnyObject = objc2::msg_send![app_cls, sharedApplication];
                    let main_menu: *mut AnyObject = objc2::msg_send![ns_app, mainMenu];
                    if main_menu.is_null() {
                        return;
                    }

                    let Some(img_cls) =
                        AnyClass::get(CStr::from_bytes_with_nul(b"NSImage\0").unwrap())
                    else {
                        return;
                    };
                    let blank: *mut AnyObject = objc2::msg_send![img_cls, new];
                    let _: () =
                        objc2::msg_send![blank, setSize: NSSize { width: 16.0, height: 16.0 }];

                    let Some(str_cls) =
                        AnyClass::get(CStr::from_bytes_with_nul(b"NSString\0").unwrap())
                    else {
                        let _: () = objc2::msg_send![blank, release];
                        return;
                    };

                    // Top-level menu names are localised by macOS so we can't look
                    // them up by English title via itemWithTitle:.
                    // Within each submenu, itemWithTitle: gives a direct O(1) lookup.
                    let targets: &[&[u8]] = &[b"Find...\0", b"Copy Web Link\0"];
                    let n: isize = objc2::msg_send![main_menu, numberOfItems];
                    for i in 0..n {
                        let top: *mut AnyObject = objc2::msg_send![main_menu, itemAtIndex: i];
                        if top.is_null() {
                            continue;
                        }
                        let sub: *mut AnyObject = objc2::msg_send![top, submenu];
                        if sub.is_null() {
                            continue;
                        }
                        for &title_bytes in targets {
                            let ns_title: *mut AnyObject = objc2::msg_send![
                                str_cls, stringWithUTF8String: title_bytes.as_ptr() as *const c_char
                            ];
                            if ns_title.is_null() {
                                continue;
                            }
                            let item: *mut AnyObject =
                                objc2::msg_send![sub, itemWithTitle: ns_title];
                            if !item.is_null() {
                                let _: () = objc2::msg_send![item, setImage: blank];
                            }
                        }
                    }

                    // Release our +1 from `new`; each setImage: retained its own ref.
                    let _: () = objc2::msg_send![blank, release];
                }));
            }

            let saved = load_session(app.handle());
            if saved.is_empty() {
                build_window(app, "main", WebviewUrl::default(), 1.0)?;
            } else {
                for (i, path_str) in saved.iter().enumerate() {
                    let label = if i == 0 {
                        "main".to_string()
                    } else {
                        format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst))
                    };
                    let url = WebviewUrl::App(path_str.trim_start_matches('/').into());
                    build_window(app, &label, url, 1.0)?;
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
