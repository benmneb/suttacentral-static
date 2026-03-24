use std::sync::atomic::{AtomicU32, Ordering};
use tauri::webview::WebviewWindow;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static TAB_COUNTER: AtomicU32 = AtomicU32::new(0);

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

    Ok(window)
}

#[cfg(target_os = "macos")]
fn apply_macos_config<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| unsafe {
        use objc2_app_kit::{NSWindow, NSWindowTabbingMode};
        use objc2_web_kit::WKWebView;

        let wk = &*(webview.inner() as *const WKWebView);
        wk.setAllowsBackForwardNavigationGestures(true);

        let ns = &*(webview.ns_window() as *const NSWindow);
        ns.setTabbingMode(NSWindowTabbingMode::Preferred);
    });
}

#[tauri::command]
fn show_link_context_menu(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let item = MenuItemBuilder::with_id(format!("new_tab:{url}"), "Open in New Tab")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .item(&item)
        .build()
        .map_err(|e| e.to_string())?;

    if let Some(window) = app
        .webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
    {
        window.popup_menu(&menu).map_err(|e| e.to_string())?;
    }

    Ok(())
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_in_new_tab,
            show_link_context_menu
        ])
        .on_menu_event(|app, event| {
            if let Some(url) = event.id().as_ref().strip_prefix("new_tab:") {
                let url = url.to_string();
                let label = format!("tab_{}", TAB_COUNTER.fetch_add(1, Ordering::SeqCst));
                if let Ok(webview_url) = url.parse() {
                    let _ = build_window(app, &label, WebviewUrl::External(webview_url));
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
            build_window(app, "main", WebviewUrl::default())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
