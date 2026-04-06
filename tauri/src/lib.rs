use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
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
static SESSION_SAVED: AtomicBool = AtomicBool::new(false);
// URL of the link most recently right-clicked; set from JS via store_context_link.
static CONTEXT_LINK: Mutex<String> = Mutex::new(String::new());
// Original IMP of WKWebView's willOpenMenu:withEvent:, saved during swizzle.
#[cfg(target_os = "macos")]
static ORIG_WILL_OPEN_MENU: std::sync::OnceLock<objc2::runtime::Imp> = std::sync::OnceLock::new();

fn save_session<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let mut windows: Vec<_> = app.webview_windows().into_iter().collect();
    windows.sort_by(|(a, _), (b, _)| {
        if a == "main" {
            std::cmp::Ordering::Less
        } else if b == "main" {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });
    let urls: Vec<String> = windows
        .iter()
        .filter_map(|(_, w)| w.url().ok())
        .map(|u| u.to_string())
        .collect();
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(
            dir.join("session.json"),
            serde_json::to_string(&urls).unwrap_or_default(),
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
) -> tauri::Result<WebviewWindow<R>> {
    let mut builder = WebviewWindowBuilder::new(manager, label, url)
        .title("SuttaCentral Express")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .fullscreen(false)
        .zoom_hotkeys_enabled(true)
        .initialization_script(include_str!("init_script.js"))
        .on_navigation(make_nav_handler());

    #[cfg(target_os = "macos")]
    {
        builder = builder.tabbing_identifier("sc-express");
    }

    let window = builder.build()?;

    #[cfg(target_os = "macos")]
    apply_macos_config(&window);

    let app_handle = manager.app_handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if SESSION_SAVED
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                save_session(&app_handle);
            }
        }
    });

    Ok(window)
}

#[cfg(target_os = "macos")]
struct ScUIDelegateIvars {
    open_tab: Box<dyn Fn(String) + Send + 'static>,
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
            _web_view: &objc2_web_kit::WKWebView,
            _config: &objc2_web_kit::WKWebViewConfiguration,
            action: &objc2_web_kit::WKNavigationAction,
            _window_features: &objc2_web_kit::WKWindowFeatures,
        ) -> Option<objc2::rc::Retained<objc2_web_kit::WKWebView>> {
            let request = action.request();
            if let Some(url) = request.URL() {
                if let Some(s) = url.absoluteString() {
                    (self.ivars().open_tab)(s.to_string());
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
        open_tab: Box<dyn Fn(String) + Send + 'static>,
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
fn apply_macos_config<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let app_for_tab = window.app_handle().clone();
    let open_tab = Box::new(move |url: String| {
        let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
        if let Ok(parsed) = url.parse() {
            let _ = build_window(&app_for_tab, &label, WebviewUrl::External(parsed));
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
    });
}

#[tauri::command]
fn open_in_new_tab(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
    let webview_url = WebviewUrl::External(url.parse().map_err(|e| format!("{e}"))?);
    build_window(&app, &label, webview_url).map_err(|e| e.to_string())?;
    Ok(())
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
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_in_new_tab,
            store_context_link
        ])
        .on_menu_event(|app, event| {
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
                app.set_menu(menu)?;
            }

            let saved = load_session(app.handle());
            if saved.is_empty() {
                build_window(app, "main", WebviewUrl::default())?;
            } else {
                for (i, url_str) in saved.iter().enumerate() {
                    let label = if i == 0 {
                        "main".to_string()
                    } else {
                        format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst))
                    };
                    let url = url_str
                        .parse()
                        .map(WebviewUrl::External)
                        .unwrap_or_else(|_| WebviewUrl::default());
                    build_window(app, &label, url)?;
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
