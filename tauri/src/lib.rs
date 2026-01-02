use tauri::WebviewUrl;
use tauri::WebviewWindowBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            // Setup logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Create main window with navigation handler
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("SuttaCentral Express")
                .inner_size(800.0, 600.0)
                .resizable(true)
                .fullscreen(false)
                .zoom_hotkeys_enabled(true)
                .on_navigation(|url| {
                    let url_str = url.as_str();

                    // Define internal URL patterns
                    let is_internal = url_str.starts_with("http://localhost:3000")
                        || url_str.starts_with("http://localhost")
                        || url_str.starts_with("tauri://localhost")
                        || url.scheme() == "tauri";

                    if is_internal {
                        // Allow internal navigation in webview
                        true
                    } else if url.scheme() == "http" || url.scheme() == "https" {
                        // External HTTP(S) URL - open in system browser
                        let url_to_open = url.to_string();
                        let _ = tauri_plugin_opener::open_url(url_to_open, None::<String>);
                        // Prevent loading in webview
                        false
                    } else if url.scheme() == "mailto" {
                        // Mailto links - open with system default
                        let mailto_url = url.to_string();
                        let _ = tauri_plugin_opener::open_url(mailto_url, None::<String>);
                        false
                    } else {
                        // Other schemes (data:, blob:, etc.) - allow
                        true
                    }
                })
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
