use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
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
    open_url: Box<dyn Fn(String) + Send + 'static>,
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
                    (self.ivars().open_url)(s.to_string());
                }
            }
            None
        }
    }
);

#[cfg(target_os = "macos")]
impl ScUIDelegate {
    fn new(
        mtm: objc2_foundation::MainThreadMarker,
        open_url: Box<dyn Fn(String) + Send + 'static>,
    ) -> objc2::rc::Retained<Self> {
        let delegate = mtm
            .alloc::<ScUIDelegate>()
            .set_ivars(ScUIDelegateIvars { open_url });
        unsafe { objc2::msg_send![super(delegate), init] }
    }
}

#[cfg(target_os = "macos")]
fn apply_macos_config<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let app_handle = window.app_handle().clone();
    let open_url = Box::new(move |url: String| {
        let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
        if let Ok(parsed) = url.parse() {
            let _ = build_window(&app_handle, &label, WebviewUrl::External(parsed));
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
        let delegate = ScUIDelegate::new(mtm, open_url);
        wk.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        std::mem::forget(delegate);
    });
}

#[tauri::command]
fn open_in_new_tab(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
    let webview_url = WebviewUrl::External(url.parse().map_err(|e| format!("{e}"))?);
    build_window(&app, &label, webview_url).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![open_in_new_tab])
        .on_menu_event(|app, event| {
            if event.id() == "copy_link" {
                let focused = app
                    .webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false));
                if let Some(window) = focused {
                    if let Ok(url) = window.url() {
                        let web_url = url
                            .as_str()
                            .replacen("http://localhost:3000", "https://suttacentral.express", 1)
                            .replacen("http://localhost", "https://suttacentral.express", 1)
                            .replacen("tauri://localhost", "https://suttacentral.express", 1);
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
